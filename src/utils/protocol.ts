import {
  ErrorCode,
  McpError,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

export const assertSupportedProtocolVersion = (
  requestedVersion: string
): void => {
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Unsupported protocol version: ${requestedVersion}`
    );
  }
};
