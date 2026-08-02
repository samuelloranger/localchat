const en = {
  tabs: {
    chats: 'Chats',
    models: 'Models',
    settings: 'Settings',
  },
  chats: {
    new: 'New chat',
    empty: 'No conversations yet. Download a model, then start chatting.',
    emptyNeedModel: 'Install a model first, then start a chat.',
    deleteTitle: 'Delete chat?',
    deleteBody: 'This removes the conversation and its messages from this device.',
    deleteConfirm: 'Delete',
    cancel: 'Cancel',
    goModels: 'Browse models',
  },
  models: {
    empty: 'Download a GGUF model from Hugging Face to chat privately on this device.',
    search: 'Search models',
    installed: 'Installed',
    available: 'Available',
    download: 'Download',
    resume: 'Resume',
    delete: 'Delete',
    retry: 'Retry',
    offline: 'You’re offline. Showing cached results when available.',
    deleteTitle: 'Delete model?',
    deleteBody: 'Removes the file from this device. Chats that used it stay readable.',
    sizeMb: '%{n} MB',
  },
  chat: {
    placeholder: 'Message',
    send: 'Send',
    stop: 'Stop',
    retry: 'Retry',
    modelSwitch: 'Next reply uses %{name}',
    noModel: 'No model selected',
  },
  settings: {
    privacy:
      'Chats and models stay on your device. Hugging Face is only used to download public models. No accounts, no analytics.',
    appearance: 'Appearance',
    language: 'Language',
    storage: 'Model storage',
    storageUsed: '%{n} MB used by models',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    english: 'English',
    french: 'Français',
    about: 'About & privacy',
  },
  test: {
    onlyInEn: 'English only',
  },
  common: {
    cancel: 'Cancel',
    confirm: 'Confirm',
  },
} as const

export default en
