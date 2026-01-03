import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import ts from 'typescript';

type HalsteadMetrics = {
  totalOperators: number;
  totalOperands: number;
  distinctOperators: number;
  distinctOperands: number;
  volume: number;
};

type FileMetrics = {
  file: string;
  loc: number;
  commentLines: number;
  commentRatio: number;
  cyclomatic: number;
  halstead: HalsteadMetrics;
  maintainabilityIndex: number;
};

const DEFAULT_THRESHOLD = 65;

const args = parseArgs({
  options: {
    dir: { type: 'string' },
    output: { type: 'string' },
    threshold: { type: 'string' },
    'fail-under': { type: 'string' },
  },
});

const baseDir = args.values.dir ?? 'src';
const thresholdValue = args.values.threshold ?? args.values['fail-under'];
const threshold = thresholdValue
  ? Number.parseFloat(thresholdValue)
  : DEFAULT_THRESHOLD;
const failUnder = args.values['fail-under'] !== undefined;

const isFunctionLike = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

const isDecisionNode = (node: ts.Node): boolean => {
  switch (node.kind) {
    case ts.SyntaxKind.IfStatement:
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.CatchClause:
    case ts.SyntaxKind.ConditionalExpression:
    case ts.SyntaxKind.CaseClause:
      return true;
    default:
      return false;
  }
};

const isLogicalOperator = (node: ts.Node): boolean =>
  ts.isBinaryExpression(node) &&
  [
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.QuestionQuestionToken,
  ].includes(node.operatorToken.kind);

const calculateFunctionComplexity = (node: ts.Node): number => {
  let complexity = 1;
  const visit = (child: ts.Node): void => {
    if (child !== node && isFunctionLike(child)) return;
    if (isDecisionNode(child) || isLogicalOperator(child)) {
      complexity += 1;
    }
    ts.forEachChild(child, visit);
  };

  const body = isFunctionLike(node) ? (node.body ?? node) : node;
  ts.forEachChild(body, visit);
  return complexity;
};

const calculateCyclomaticComplexity = (source: ts.SourceFile): number => {
  const functions: ts.FunctionLikeDeclaration[] = [];
  const collect = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      functions.push(node);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  if (functions.length === 0) return 0;
  return functions.reduce(
    (sum, fn) => sum + calculateFunctionComplexity(fn),
    0
  );
};

const getLineNumber = (lineStarts: readonly number[], pos: number): number => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid] ?? 0;
    const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;
    if (pos < start) {
      high = mid - 1;
    } else if (pos >= next) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return lineStarts.length - 1;
};

const countCommentLines = (text: string): number => {
  const lineStarts = ts.computeLineStarts(text);
  const lines = new Set<number>();
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text
  );

  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const start = scanner.getTokenPos();
      const end = Math.max(start, scanner.getTextPos() - 1);
      const startLine = getLineNumber(lineStarts, start);
      const endLine = getLineNumber(lineStarts, end);
      for (let line = startLine; line <= endLine; line += 1) {
        lines.add(line);
      }
    }
    token = scanner.scan();
  }

  return lines.size;
};

const isOperandToken = (kind: ts.SyntaxKind): boolean => {
  switch (kind) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.PrivateIdentifier:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.SuperKeyword:
      return true;
    default:
      return false;
  }
};

const calculateHalstead = (text: string): HalsteadMetrics => {
  const distinctOperators = new Set<string>();
  const distinctOperands = new Set<string>();
  let totalOperators = 0;
  let totalOperands = 0;

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    text
  );

  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.WhitespaceTrivia) {
      token = scanner.scan();
      continue;
    }

    const tokenText = scanner.getTokenText();
    const displayText = tokenText || ts.tokenToString(token) || '';

    if (isOperandToken(token)) {
      totalOperands += 1;
      distinctOperands.add(displayText);
    } else if (displayText) {
      totalOperators += 1;
      distinctOperators.add(displayText);
    }

    token = scanner.scan();
  }

  const n1 = distinctOperators.size;
  const n2 = distinctOperands.size;
  const N1 = totalOperators;
  const N2 = totalOperands;
  const vocabulary = Math.max(1, n1 + n2);
  const length = N1 + N2;
  const volume = length > 0 ? length * Math.log2(vocabulary) : 0;

  return {
    totalOperators: N1,
    totalOperands: N2,
    distinctOperators: n1,
    distinctOperands: n2,
    volume: Number(volume.toFixed(2)),
  };
};

const calculateMI = (
  loc: number,
  cyclomatic: number,
  halsteadVolume: number,
  commentRatio: number
): number => {
  const safeLoc = Math.max(1, loc);
  const safeVolume = Math.max(1, halsteadVolume);
  const safeComplexity = Math.max(1, cyclomatic);
  const miRaw =
    171 -
    5.2 * Math.log(safeVolume) -
    0.23 * safeComplexity -
    16.2 * Math.log(safeLoc) +
    50 * Math.sin(Math.sqrt(2.4 * commentRatio));
  const mi = (miRaw * 100) / 171;
  return Number(Math.max(0, Math.min(100, mi)).toFixed(2));
};

const isTsFile = (filePath: string): boolean =>
  filePath.endsWith('.ts') && !filePath.endsWith('.d.ts');

const walkDir = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(resolved)));
    } else if (entry.isFile() && isTsFile(resolved)) {
      files.push(resolved);
    }
  }
  return files;
};

const analyzeFile = async (filePath: string): Promise<FileMetrics> => {
  const text = await fs.readFile(filePath, 'utf8');
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true
  );
  const loc = text.split(/\r\n|\r|\n/).length;
  const commentLines = countCommentLines(text);
  const commentRatio = Number(((commentLines / loc) * 100).toFixed(2));
  const cyclomatic = calculateCyclomaticComplexity(source);
  const halstead = calculateHalstead(text);
  const maintainabilityIndex = calculateMI(
    loc,
    cyclomatic,
    halstead.volume,
    commentRatio
  );

  return {
    file: filePath,
    loc,
    commentLines,
    commentRatio,
    cyclomatic,
    halstead,
    maintainabilityIndex,
  };
};

const toRelativePath = (filePath: string): string =>
  path.relative(process.cwd(), filePath);

const main = async (): Promise<void> => {
  const root = path.resolve(process.cwd(), baseDir);
  const filePaths = await walkDir(root);
  const metrics = await Promise.all(filePaths.map(analyzeFile));

  const normalized = metrics.map((entry) => ({
    ...entry,
    file: toRelativePath(entry.file),
  }));

  const totalMi = normalized.reduce(
    (sum, entry) => sum + entry.maintainabilityIndex,
    0
  );
  const minMi = normalized.reduce(
    (min, entry) => Math.min(min, entry.maintainabilityIndex),
    Number.POSITIVE_INFINITY
  );

  const report = {
    generatedAt: new Date().toISOString(),
    threshold,
    summary: {
      files: normalized.length,
      averageMaintainability: Number(
        (normalized.length === 0 ? 0 : totalMi / normalized.length).toFixed(2)
      ),
      minMaintainability:
        normalized.length === 0 ? 0 : Number(minMi.toFixed(2)),
    },
    files: normalized,
  };

  const json = JSON.stringify(report, null, 2);
  if (args.values.output) {
    const outputPath = path.resolve(process.cwd(), args.values.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, json, 'utf8');
  }

  // Always emit report to stdout for CI logs.
  process.stdout.write(`${json}\n`);

  if (failUnder && minMi < threshold) {
    process.exitCode = 1;
  }
};

await main();
