const quirks = require('./quirks')

/**
 * Signal K server plugin that exposes canboatjs device quirks as a
 * settings section. Enabled quirks are published as PropertyValues so
 * N2kMapper (and a FromPgn that listens for `canboatjs-quirks`) can
 * pick them up without patching individual PGN handlers.
 */
function createPlugin (app) {
  let currentQuirks = []

  const plugin = {
    id: 'n2k-signalk',
    name: 'NMEA 2000 to Signal K',
    description:
      'NMEA 2000 to Signal K conversion. Use Quirks to opt in to workarounds for known device misbehaviour (for example GPS week rollover on old receivers).',
    enabledByDefault: true,
    schema: () => quirks.schema(),
    uiSchema: () => quirks.uiSchema(),
    start: function (settings) {
      publish(settings || {})
    },
    stop: function () {
      currentQuirks = []
      if (typeof app.emitPropertyValue === 'function') {
        app.emitPropertyValue('canboatjs-quirks', [])
      }
    },
    statusMessage: function () {
      if (currentQuirks.length === 0) {
        return 'No quirks enabled'
      }
      return 'Quirks: ' + currentQuirks.join(', ')
    }
  }

  function publish (settings) {
    const options = quirks.toCanboatOptions(settings)
    currentQuirks = options.quirks
    if (typeof app.emitPropertyValue === 'function') {
      app.emitPropertyValue('canboatjs-quirks', options.quirks)
      if (options.quirkParameters) {
        app.emitPropertyValue(
          'canboatjs-quirk-parameters',
          options.quirkParameters
        )
      }
    }
    if (typeof app.setPluginStatus === 'function') {
      app.setPluginStatus(plugin.statusMessage())
    }
    if (app.debug && app.debug.enabled) {
      app.debug('quirks %j', options)
    }
  }

  return plugin
}

module.exports = createPlugin
