import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiModuleDef } from '../manifest/ui-module-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';

/** Область сборки реестров: приложение UI или набор целиком. */
export type RegistryScope = AnyUiAppDef | AnyUiSetDef;

/** Реестр одного UI-модуля: код или представления канала. */
export type ModuleRegistry = { readonly module: AnyUiModuleDef };
