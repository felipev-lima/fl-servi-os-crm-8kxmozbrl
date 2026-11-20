import type { ChecklistItem } from './checklist'

export type UserRole = 'admin' | 'tecnico' | 'consulta' | 'superadmin'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  phone?: string
  avatar?: string
  /** Empresa (tenant) a que o usuário pertence */
  company?: string
  active?: boolean
  created: string
  updated: string
}

export interface Company {
  id: string
  name: string
  trade_name?: string
  slug: string
  logo?: string
  whatsapp?: string
  email?: string
  city?: string
  active?: boolean
  created: string
  updated: string
}

export interface Client {
  id: string
  name: string
  type?: 'PF' | 'PJ'
  phone?: string
  email?: string
  document?: string
  address?: string
  neighborhood?: string
  city?: string
  notes?: string
  created: string
  updated: string
}

export interface Technician {
  id: string
  name: string
  phone?: string
  email?: string
  role_title?: string
  specialties?: string
  active: boolean
  user?: string
  /** Rubrica desenhada uma vez e usada no PDF das OS */
  signature?: string
  created: string
  updated: string
}

export interface Material {
  id: string
  name: string
  unit: 'UN' | 'M' | 'KG' | 'L' | 'CX' | 'PC' | 'PAR' | 'ROLO'
  category?: string
  brand?: string
  price?: number
  current_stock?: number
  notes?: string
  /** Cadastrado rápido pelo técnico em campo — aguarda revisão do admin */
  pending_review?: boolean
  created: string
  updated: string
}

export type OrderStatus =
  | 'ABERTA'
  | 'AGENDADA'
  | 'EM ANDAMENTO'
  | 'AGUARDANDO MATERIAL'
  | 'FINALIZADA'
  | 'CANCELADA'

export type ServiceType =
  | 'Instalação'
  | 'Manutenção Preventiva'
  | 'Manutenção Corretiva'
  | 'Vistoria Técnica'
  | 'CFTV / Alarme'
  | 'Rede / Telecom'
  | 'Outro'

export interface WorkOrder {
  id: string
  order_number: number
  client: string
  technician?: string
  service_type: ServiceType
  status: OrderStatus
  description: string
  technical_report?: string
  /** Valor de mão de obra cobrado pelo serviço (usado na nota/faturamento) */
  service_value?: number
  /** Pagamento já recebido do cliente — abate do débito total na nota */
  payment_received?: number
  /**
   * Situação do envio da planilha ao sistema financeiro externo do Felipe.
   * 'PENDENTE' é o padrão quando o campo nunca foi tocado.
   */
  planilha_envio?: 'PENDENTE' | 'ENVIADA'
  planilha_enviada_em?: string
  scheduled_date?: string
  opened_at?: string
  completed_at?: string
  location_lat?: number
  location_lng?: number
  location_address?: string
  signature_image?: string
  client_signer_name?: string
  client_signer_doc?: string
  notes?: string
  checklist?: ChecklistItem[]
  created: string
  updated: string

  // Expansões
  expand?: {
    client?: Client
    technician?: Technician
  }
}

export interface OrderMaterial {
  id: string
  work_order: string
  material: string
  quantity: number
  unit: string
  unit_price?: number
  total_price?: number
  notes?: string
  created: string
  updated: string

  expand?: {
    material?: Material
  }
}

export interface OrderPhoto {
  id: string
  work_order: string
  image: string
  description?: string
  caption?: string
  display_order?: number
  captured_at?: string
  created: string
  updated: string
}

export interface OrderHistory {
  id: string
  work_order: string
  status_from?: string
  status_to: string
  user_name: string
  user_id?: string
  notes?: string
  created: string
  updated: string
}

export interface MaterialKit {
  id: string
  name: string
  description?: string
  service_type?: ServiceType
  active?: boolean
  created: string
  updated: string
}

export interface MaterialKitItem {
  id: string
  kit: string
  material: string
  quantity?: number
  notes?: string
  created: string
  updated: string

  expand?: {
    material?: Material
  }
}

export interface FutureMaintenance {
  id: string
  client: string
  scheduled_date: string
  maintenance_type: string
  technician?: string
  status: 'PENDENTE' | 'CONCLUIDA' | 'CANCELADA'
  notes?: string
  created: string
  updated: string

  expand?: {
    client?: Client
    technician?: Technician
  }
}
