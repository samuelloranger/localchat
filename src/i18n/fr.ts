const fr = {
  tabs: {
    chats: 'Discussions',
    models: 'Modèles',
    settings: 'Réglages',
  },
  chats: {
    new: 'Nouvelle discussion',
    empty:
      'Aucune discussion pour l’instant. Téléchargez un modèle, puis commencez à discuter.',
    emptyNeedModel: 'Installez d’abord un modèle, puis démarrez une discussion.',
    deleteTitle: 'Supprimer la discussion ?',
    deleteBody: 'Cela efface la conversation et ses messages de cet appareil.',
    deleteConfirm: 'Supprimer',
    cancel: 'Annuler',
    goModels: 'Parcourir les modèles',
  },
  models: {
    empty:
      'Téléchargez un modèle GGUF depuis Hugging Face pour discuter en privé sur cet appareil.',
    search: 'Rechercher des modèles',
    installed: 'Installés',
    available: 'Disponibles',
    download: 'Télécharger',
    resume: 'Reprendre',
    delete: 'Supprimer',
    retry: 'Réessayer',
    offline: 'Hors ligne. Affichage du cache s’il est disponible.',
    deleteTitle: 'Supprimer le modèle ?',
    deleteBody:
      'Supprime le fichier de cet appareil. Les discussions qui l’ont utilisé restent lisibles.',
    sizeMb: '%{n} Mo',
  },
  chat: {
    placeholder: 'Message',
    send: 'Envoyer',
    stop: 'Arrêter',
    retry: 'Réessayer',
    modelSwitch: 'La prochaine réponse utilisera %{name}',
    noModel: 'Aucun modèle sélectionné',
  },
  settings: {
    privacy:
      'Les discussions et modèles restent sur votre appareil. Hugging Face sert uniquement à télécharger des modèles publics. Pas de compte, pas d’analytique.',
    appearance: 'Apparence',
    language: 'Langue',
    storage: 'Stockage des modèles',
    storageUsed: '%{n} Mo utilisés par les modèles',
    system: 'Système',
    light: 'Clair',
    dark: 'Sombre',
    english: 'English',
    french: 'Français',
    about: 'À propos et confidentialité',
  },
  common: {
    cancel: 'Annuler',
    confirm: 'Confirmer',
  },
} as const

export default fr
