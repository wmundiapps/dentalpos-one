// Único ponto de acoplamento do front da "Carteira de clientes" com o hospedeiro (EduMaster Pro): cliente de API, moldura, kit visual e sessão.
// Para portar o bloco para outro produto, reimplemente estes re-exports.
export { eduApi } from "../../../services/EduApi";
export { default as Shell } from "../../EduShell";
export { Async, Bars, Empty, FormDialog, Kanban, Panel, Stat, StatGrid, SubNav, Tag, brl, fmtDate, fmtDateTime, num, useApi, useToast, type Field } from "../../infraestrutura/kit";
export { Tabela, type Col } from "../../rh/kit";
export { readSessionUser } from "../../../services/DemoAccess";
