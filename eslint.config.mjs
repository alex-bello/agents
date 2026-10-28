import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["skills/source-control/scripts/sc"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
