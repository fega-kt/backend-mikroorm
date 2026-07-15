export interface RouteHandle {
  icon?: string;
  title?: string;
  order?: number;
  roles?: string[];
  permissions?: string[];
  iframeLink?: string;
  externalLink?: string;
  keepAlive?: boolean;
}

export interface AppRoute {
  path: string;
  component?: string;
  handle?: RouteHandle;
  children?: AppRoute[];
}
