var chai = require('chai')
chai.Should()
chai.use(require('chai-things'))

const {
  GPS_ROLLOVER_DAYS,
  MIN_REFERENCE_DAY,
  schema,
  uiSchema,
  knownQuirks,
  quirkSettingSchema,
  toCanboatQuirks,
  toQuirkParameters,
  toCanboatOptions,
  isQuirkEnabled,
  dateStringToDays,
  correctedGpsDate,
  correctGpsDateString,
  applyQuirksToN2k
} = require('../dist/quirks')
const createPlugin = require('../dist/plugin')
const { N2kMapper, toDelta } = require('../dist/n2kMapper')
const PropertyValues = require('@signalk/server-api').PropertyValues

const ROLLED_OVER_129029 = {
  timestamp: '2022-07-04T20:13:03.000Z',
  prio: 3,
  src: 35,
  dst: 255,
  pgn: 129029,
  fields: {
    date: '2002.11.18',
    time: '20:13:03',
    latitude: 42.49,
    longitude: -70.88
  }
}

describe('quirks catalog and schema', function () {
  it('includes gps-rollover with an enable toggle', function () {
    const gps = knownQuirks().find(q => q.id === 'gps-rollover')
    gps.should.be.an('object')
    gps.title.should.equal('GPS week rollover')
    gps.defaultEnabled.should.equal(false)
    gps.parameters.should.deep.equal([])
  })

  it('schema exposes a quirks section with per-quirk enabled flags', function () {
    const s = schema()
    s.type.should.equal('object')
    s.properties.quirks.should.be.an('object')
    s.properties.quirks.title.should.equal('Quirks')
    const gps = s.properties.quirks.properties['gps-rollover']
    gps.type.should.equal('object')
    gps.properties.enabled.type.should.equal('boolean')
    gps.properties.enabled.default.should.equal(false)
  })

  it('schema includes declared parameters next to the toggle', function () {
    const withParam = quirkSettingSchema({
      id: 'example',
      title: 'Example quirk',
      description: 'Has a parameter',
      defaultEnabled: false,
      parameters: [
        {
          name: 'epochs',
          type: 'number',
          title: 'Epochs to add',
          default: 1,
          minimum: 1,
          maximum: 2
        }
      ]
    })
    withParam.properties.enabled.type.should.equal('boolean')
    withParam.properties.epochs.should.deep.equal({
      type: 'number',
      title: 'Epochs to add',
      default: 1,
      minimum: 1,
      maximum: 2
    })
    Object.keys(
      schema().properties.quirks.properties['gps-rollover'].properties
    ).should.deep.equal(['enabled'])
  })

  it('uiSchema marks the quirks object as collapsible', function () {
    uiSchema().quirks['ui:field'].should.equal('collapsible')
  })
})

describe('toCanboatQuirks', function () {
  it('returns [] for empty / missing config', function () {
    toCanboatQuirks().should.deep.equal([])
    toCanboatQuirks(null).should.deep.equal([])
    toCanboatQuirks({}).should.deep.equal([])
    toCanboatQuirks({ quirks: {} }).should.deep.equal([])
  })

  it('accepts a canboatjs-style string array', function () {
    toCanboatQuirks(['gps-rollover']).should.deep.equal(['gps-rollover'])
    toCanboatQuirks({ quirks: ['gps-rollover'] }).should.deep.equal([
      'gps-rollover'
    ])
  })

  it('reads enabled toggles from the plugin settings shape', function () {
    toCanboatQuirks({
      quirks: { 'gps-rollover': { enabled: true } }
    }).should.deep.equal(['gps-rollover'])
    toCanboatQuirks({
      quirks: { 'gps-rollover': { enabled: false } }
    }).should.deep.equal([])
    toCanboatQuirks({
      'gps-rollover': { enabled: true }
    }).should.deep.equal(['gps-rollover'])
    toCanboatQuirks({ 'gps-rollover': true }).should.deep.equal([
      'gps-rollover'
    ])
  })

  it('collects parameters when a quirk is enabled', function () {
    toQuirkParameters({
      quirks: { 'gps-rollover': { enabled: true, leftover: 1 } }
    }).should.deep.equal({})
    toCanboatOptions({
      quirks: { 'gps-rollover': { enabled: true } }
    }).should.deep.equal({ quirks: ['gps-rollover'] })
  })

  it('isQuirkEnabled handles arrays and settings objects', function () {
    isQuirkEnabled(['gps-rollover'], 'gps-rollover').should.equal(true)
    isQuirkEnabled([], 'gps-rollover').should.equal(false)
    isQuirkEnabled(
      { quirks: { 'gps-rollover': { enabled: true } } },
      'gps-rollover'
    ).should.equal(true)
  })
})

describe('GPS week rollover arithmetic', function () {
  const reference = MIN_REFERENCE_DAY

  it('adds one epoch to a 2002 date (2002-11-18 -> 2022-07-04)', function () {
    const days = dateStringToDays('2002.11.18')
    correctedGpsDate(days, reference).should.equal(days + GPS_ROLLOVER_DAYS)
    correctGpsDateString('2002.11.18', reference).should.equal('2022.07.04')
    correctGpsDateString('2002-11-18', reference).should.equal('2022-07-04')
  })

  it('leaves a current date untouched', function () {
    correctGpsDateString('2026.01.15', reference).should.equal('2026.01.15')
  })

  it('leaves a merely-old date inside half an epoch untouched', function () {
    // 2020-01-01 is ~6 years behind 2026-01-01, under 9.8 years
    correctGpsDateString('2020.01.01', reference).should.equal('2020.01.01')
  })
})

describe('applyQuirksToN2k', function () {
  const quirks = ['gps-rollover']

  it('corrects 129029 when gps-rollover is on', function () {
    const out = applyQuirksToN2k(ROLLED_OVER_129029, quirks, MIN_REFERENCE_DAY)
    out.fields.date.should.equal('2022.07.04')
    out.should.not.equal(ROLLED_OVER_129029)
  })

  it('does not touch 129029 when the quirk is off', function () {
    const out = applyQuirksToN2k(ROLLED_OVER_129029, [], MIN_REFERENCE_DAY)
    out.fields.date.should.equal('2002.11.18')
    out.should.equal(ROLLED_OVER_129029)
  })

  it('corrects 126992 only when Source is GPS', function () {
    const gps = {
      pgn: 126992,
      fields: { date: '2002.11.18', time: '20:13:03', source: 'GPS' }
    }
    const local = {
      pgn: 126992,
      fields: {
        date: '2002.11.18',
        time: '20:13:03',
        source: 'Local crystal clock'
      }
    }
    applyQuirksToN2k(gps, quirks, MIN_REFERENCE_DAY).fields.date.should.equal(
      '2022.07.04'
    )
    applyQuirksToN2k(local, quirks, MIN_REFERENCE_DAY).fields.date.should.equal(
      '2002.11.18'
    )
  })

  it('corrects 129033 Time & Date', function () {
    const msg = {
      pgn: 129033,
      fields: { Date: '2002.11.18', Time: '20:13:03' }
    }
    applyQuirksToN2k(msg, quirks, MIN_REFERENCE_DAY).fields.Date.should.equal(
      '2022.07.04'
    )
  })
})

describe('N2kMapper quirks option', function () {
  it('maps 129029 datetime with gps-rollover off (default)', function () {
    const mapper = new N2kMapper()
    const delta = mapper.toDelta(ROLLED_OVER_129029)
    const datetime = delta.updates[0].values.find(
      v => v.path === 'navigation.datetime'
    )
    datetime.value.should.equal('2002-11-18T20:13:03Z')
  })

  it('maps 129029 datetime corrected when quirks: [gps-rollover]', function () {
    const mapper = new N2kMapper({ quirks: ['gps-rollover'] })
    const delta = mapper.toDelta(ROLLED_OVER_129029)
    const datetime = delta.updates[0].values.find(
      v => v.path === 'navigation.datetime'
    )
    datetime.value.should.equal('2022-07-04T20:13:03Z')
  })

  it('maps 129029 datetime corrected from plugin settings shape', function () {
    const mapper = new N2kMapper({
      quirks: { 'gps-rollover': { enabled: true } }
    })
    const delta = mapper.toDelta(ROLLED_OVER_129029)
    const datetime = delta.updates[0].values.find(
      v => v.path === 'navigation.datetime'
    )
    datetime.value.should.equal('2022-07-04T20:13:03Z')
  })

  it('picks up quirks published as PropertyValues', function () {
    const propertyValues = new PropertyValues()
    const mapper = new N2kMapper({
      onPropertyValues: propertyValues.onPropertyValues.bind(propertyValues)
    })
    propertyValues.emitPropertyValue({
      timestamp: Date.now(),
      setter: 'n2k-signalk',
      name: 'canboatjs-quirks',
      value: ['gps-rollover']
    })
    const delta = mapper.toDelta(ROLLED_OVER_129029)
    const datetime = delta.updates[0].values.find(
      v => v.path === 'navigation.datetime'
    )
    datetime.value.should.equal('2022-07-04T20:13:03Z')
  })

  it('toDelta options.quirks corrects without an N2kMapper instance', function () {
    const delta = toDelta(
      ROLLED_OVER_129029,
      {},
      {},
      { quirks: ['gps-rollover'] }
    )
    const datetime = delta.updates[0].values.find(
      v => v.path === 'navigation.datetime'
    )
    datetime.value.should.equal('2022-07-04T20:13:03Z')
  })
})

describe('plugin', function () {
  it('is the package default export, with mapper named exports attached', function () {
    const pkg = require('../dist/index')
    pkg.default.should.be.a('function')
    pkg.N2kMapper.should.be.a('function')
    pkg.toDelta.should.be.a('function')
    pkg.toCanboatQuirks.should.be.a('function')
    pkg
      .toCanboatQuirks({
        quirks: { 'gps-rollover': { enabled: true } }
      })
      .should.deep.equal(['gps-rollover'])
    const plugin = pkg.default({
      emitPropertyValue: () => {},
      setPluginStatus: () => {},
      debug: Object.assign(() => {}, { enabled: false })
    })
    plugin.id.should.equal('n2k-signalk')
  })

  it('exposes schema, start/stop and publishes canboatjs-quirks', function () {
    const published = {}
    const statuses = []
    const plugin = createPlugin({
      emitPropertyValue: (name, value) => {
        published[name] = value
      },
      setPluginStatus: msg => statuses.push(msg),
      debug: Object.assign(() => {}, { enabled: false })
    })

    plugin.id.should.equal('n2k-signalk')
    plugin.name.should.equal('NMEA 2000 to Signal K')
    plugin.start.should.be.a('function')
    plugin.stop.should.be.a('function')

    const s = plugin.schema()
    s.properties.quirks.properties[
      'gps-rollover'
    ].properties.enabled.type.should.equal('boolean')

    plugin.start({ quirks: { 'gps-rollover': { enabled: true } } })
    published['canboatjs-quirks'].should.deep.equal(['gps-rollover'])
    plugin.statusMessage().should.equal('Quirks: gps-rollover')
    statuses[0].should.equal('Quirks: gps-rollover')

    plugin.stop()
    published['canboatjs-quirks'].should.deep.equal([])
    plugin.statusMessage().should.equal('No quirks enabled')
  })
})
