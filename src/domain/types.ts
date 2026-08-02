export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageStatus = 'complete' | 'streaming' | 'error'

export type Conversation = {
  id: string
  title: string
  modelId: string
  createdAt: number
  updatedAt: number
}

export type Message = {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: number
  status: MessageStatus
}

export type InstalledModel = {
  id: string
  repoId: string
  filename: string
  displayName: string
  sizeBytes: number
  localPath: string
  downloadedAt: number
  lastUsedAt: number | null
}

export type HubGgufFile = {
  repoId: string
  filename: string
  displayName: string
  sizeBytes: number
  sha?: string
  quant?: string
  downloads?: number
  lastModified?: number
}
