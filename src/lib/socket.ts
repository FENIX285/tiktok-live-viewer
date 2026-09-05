import { eulerLiveClient, EulerStreamLiveClient } from "./eulerSocket";

export function getSocket(): EulerStreamLiveClient {
  return eulerLiveClient;
}

export { eulerLiveClient };

