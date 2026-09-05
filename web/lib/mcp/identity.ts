/**
 * What Tonight calls itself over MCP.
 *
 * Its own module so that a page can name the version without importing the MCP
 * server — which would pull the protocol SDK into a bundle that has no use for
 * it. Two strings, one definition: the value `get_server_info` reports is the
 * value the setup guide tells somebody to expect, and they cannot drift.
 */

export const SERVER_NAME = "Tonight";

/**
 * Bumped when the tool surface changes in a way a client would notice.
 *
 * A client reads it from `get_server_info`, and `/setup` prints it as the value
 * to check a connection against — an answer nobody can give without having
 * called the tool.
 */
export const SERVER_VERSION = "0.1.0";
