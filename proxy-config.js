export function configureProxyTrust(app, environment = process.env) {
  const isRender = environment.RENDER === 'true' || Boolean(environment.RENDER_SERVICE_ID);
  const trustProxy = environment.TRUST_PROXY === 'true' || isRender;
  if (trustProxy) app.set('trust proxy', 1);
  return trustProxy;
}