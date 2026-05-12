import assert from 'node:assert/strict'
import test from 'node:test'
import { Html5QrcodeSupportedFormats } from 'html5-qrcode'
import {
  BARCODE_FORMATS_TO_SUPPORT,
  BARCODE_READER_CONFIG,
  BARCODE_SCAN_CONFIG,
  normalizeBarcodeText,
} from './barcodeScanner.js'

test('barcode scanner prioritizes common product barcode formats', () => {
  assert.deepEqual(BARCODE_FORMATS_TO_SUPPORT, [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.CODABAR,
    Html5QrcodeSupportedFormats.QR_CODE,
  ])
})

test('barcode scan config uses a wide horizontal scan window', () => {
  const box = BARCODE_SCAN_CONFIG.qrbox(320, 240)

  assert.equal(BARCODE_SCAN_CONFIG.fps, 20)
  assert.equal(BARCODE_SCAN_CONFIG.disableFlip, false)
  assert.deepEqual(box, { width: 304, height: 144 })
})

test('barcode reader uses the ZXing decoder for stable one-dimensional barcode scans', () => {
  assert.equal(BARCODE_READER_CONFIG.useBarCodeDetectorIfSupported, false)
})

test('normalizeBarcodeText trims scanner noise without dropping leading zeroes', () => {
  assert.equal(normalizeBarcodeText('  0 471 0000 01234 \n'), '0471000001234')
  assert.equal(normalizeBarcodeText(null), '')
})
