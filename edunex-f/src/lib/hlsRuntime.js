let runtime;
export function loadHlsJs() {
  if (!runtime) runtime = import('hls.js').then(module => module.default).catch(error => { runtime = null; throw error; });
  return runtime;
}
