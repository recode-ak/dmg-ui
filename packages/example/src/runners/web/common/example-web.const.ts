/** Пути служебных адресов примера; все начинаются с `/_`, страницы приложения — прочие. */
export const EXAMPLE_PATHS = {
  app: '/_app.js',
  styles: '/_app.css',
  socket: '/_socket',
  enter: '/_enter/',
} as const;

/** Имя cookie с пропуском человека. */
export const EXAMPLE_COOKIE = 'example_pass';

/** Области страницы по порядку: единственный перечень литералов областей примера. */
export const EXAMPLE_REGIONS = ['main', 'side', 'modal'] as const;
