export type Provider = "forgejo" | "github";

export type GlobalOptions = {
  provider: "auto" | Provider;
  repo: string | null;
  remote: string;
  limit: number;
};

export type NativeResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error & { code?: string };
};

export type CommandOptions = { allowFailure?: boolean };
export type JsonRecord = Record<string, any>;
export type ParsedOptions = { _: string[]; [key: string]: any };

export type ExitCode =
  | 0 // success
  | 2 // invalid command or arguments
  | 3 // provider detection
  | 4 // unsupported operation
  | 5 // missing executable or file
  | 6 // authentication
  | 7 // native command failure
  | 8; // output normalization
