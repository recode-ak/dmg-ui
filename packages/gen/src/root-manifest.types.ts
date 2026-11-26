/** Поля `package.json` корня проекта, нужные виду; значения не проверены */
export type RootManifestJson = {
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly workspaces?: unknown;
};
