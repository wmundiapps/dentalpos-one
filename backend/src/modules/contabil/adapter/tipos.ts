// Contrato (interface única) entre o bloco contábil e o sistema que o hospeda.
// Para plugar em outro sistema, implemente `ContabilAdapter` e registre com `definirAdapter` (ver README.md).

export type PapelContabil = 'GESTOR' | 'CONTADOR' | 'FINANCEIRO' | 'LEITOR'

export interface ContextoUsuario {
  tenantId: string
  userId: string
  /** Cargo/papel no sistema hospedeiro (texto livre; só o adapter sabe interpretá-lo). */
  cargo: string
  /** true quando o hospedeiro concedeu acesso explícito ao módulo (ex.: matriz de acesso por cargo) — vira papel LEITOR. */
  acessoConcedido?: boolean
}

/** Entidade (empresa/pessoa) do sistema hospedeiro que pode virar cliente do escritório. */
export interface EntidadeExterna {
  id: string
  tipoPessoa: 'PJ' | 'PF'
  documento: string
  nome: string
  nomeFantasia?: string | null
  email?: string | null
  telefone?: string | null
  uf?: string | null
  municipio?: string | null
}

export interface ContabilAdapter {
  nome: string
  /** Extrai tenant/usuário/cargo da requisição já autenticada pelo sistema hospedeiro. null = não autenticado. */
  contexto(req: any): ContextoUsuario | null
  /** Converte o cargo do hospedeiro em papel contábil; 'NEGAR' bloqueia sempre (ex.: aluno/professor); null = sem papel automático. */
  mapearCargo(cargo: string): PapelContabil | 'NEGAR' | null
  /** Nomes de exibição dos usuários (para trilha de auditoria e telas). */
  nomesUsuarios(tenantId: string, ids: string[]): Promise<Record<string, string>>
  /** Nome da instituição/escritório do tenant (cabeçalho de relatórios). */
  nomeInstituicao(tenantId: string): Promise<string>
  /** (Opcional) entidades do sistema hospedeiro que podem ser importadas como empresas-cliente. */
  listarEntidades?(tenantId: string, busca?: string): Promise<EntidadeExterna[]>
  obterEntidade?(tenantId: string, id: string): Promise<EntidadeExterna | null>
}
