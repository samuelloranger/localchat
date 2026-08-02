import React from 'react'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'

import { LocaleProvider, useTranslation } from '../src/i18n/LocaleProvider'

// The RAM estimate used to be assembled as `~${n} GB RAM` in models.tsx, which
// shipped English to French users. It now goes through estimatedRam + ramUnit,
// so assert the rendered phrase — the unit alone would not catch a regression
// in the surrounding wording or word order.
function RamUnitProbe() {
  const { t } = useTranslation()
  return (
    <Text testID="ram">{t('models.estimatedRam', { n: '2.0', unit: t('models.ramUnit') })}</Text>
  )
}

function Probe() {
  const { t } = useTranslation()
  return <Text testID="label">{t('tabs.chats')}</Text>
}

test('LocaleProvider renders french labels', async () => {
  await render(
    <LocaleProvider initialLocale="fr">
      <Probe />
    </LocaleProvider>,
  )
  expect(screen.getByTestId('label').props.children).toBe('Discussions')
})

test('LocaleProvider renders english labels', async () => {
  await render(
    <LocaleProvider initialLocale="en">
      <Probe />
    </LocaleProvider>,
  )
  expect(screen.getByTestId('label').props.children).toBe('Chats')
})

test('models.ramUnit i18n key is localized', async () => {
  await render(
    <LocaleProvider initialLocale="en">
      <RamUnitProbe />
    </LocaleProvider>,
  )
  expect(screen.getByTestId('ram').props.children).toBe('~2.0 GB RAM')

  await render(
    <LocaleProvider initialLocale="fr">
      <RamUnitProbe />
    </LocaleProvider>,
  )
  expect(screen.getByTestId('ram').props.children).toBe('~2.0 Go de RAM')
})
