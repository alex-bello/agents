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

export type CommandOptions = { allowFailure?: boolean; skipVersionCheck?: boolean };
export type JsonValue = null | boolean | number | string | JsonRecord | JsonValue[];
export type JsonRecord = { [key: string]: JsonValue | undefined };
export type OptionKind = "boolean" | "value" | "many";
export type ParsedOptions<Definitions extends { [Name in keyof Definitions]: OptionKind } = Record<string, OptionKind>> = {
  _: string[];
} & {
  [Name in keyof Definitions as Definitions[Name] extends "many" ? Name : never]: string[];
} & {
  [Name in keyof Definitions as Definitions[Name] extends "boolean" ? Name : never]: boolean;
} & {
  [Name in keyof Definitions as Definitions[Name] extends "value" ? Name : never]: string;
};

export type ExitCode =
  | 0 // success
  | 2 // invalid command or arguments
  | 3 // provider detection
  | 4 // unsupported operation
  | 5 // missing executable or file
  | 6 // authentication
  | 7 // native command failure
  | 8 // output normalization
  | 9; // unsupported or undeterminable native tool version
