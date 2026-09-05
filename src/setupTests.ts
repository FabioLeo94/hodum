import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import i18n from './shared/i18n/i18n'

// jsdom espone navigator.language come "en-US": senza forzare la lingua qui,
// i18next-browser-languagedetector selezionerebbe l'inglese in ogni test,
// mentre le asserzioni esistenti si aspettano il testo italiano (lingua di
// fallback dell'app).
void i18n.changeLanguage('it')

// jsdom non implementa showModal()/close() su HTMLDialogElement (solo la
// proprietà riflessa "open"). Stub minimale riusabile da qualsiasi test
// che monti una pagina con una <dialog> dentro.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

afterEach(() => {
  cleanup()
})
