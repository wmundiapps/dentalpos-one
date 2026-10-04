// Ponto de entrada: as guardas de segurança rodam ANTES de carregar e montar o app.
import { runHostGuard } from "./security/hostGuard";
import { startDevtoolsGuard } from "./security/devtoolsGuard";
import { startSessionGuard } from "./security/sessionGuard";

if (runHostGuard()) {
  startDevtoolsGuard();
  startSessionGuard();
  void import("./bootstrap");
}
