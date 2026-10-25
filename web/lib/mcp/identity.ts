/**
 * What Tonight calls itself over MCP.
 *
 * Its own module so that anything can name the version without importing the MCP
 * server — which would pull the protocol SDK into a bundle that has no use for
 * it. Two strings, one definition.
 */

export const SERVER_NAME = "Tonight";

/**
 * Bumped when the tool surface changes in a way a client would notice.
 *
 * A client reads it from `get_server_info`, which makes it a value to check a
 * connection against — an answer nobody can give without having called the tool.
 */
export const SERVER_VERSION = "0.4.0";
