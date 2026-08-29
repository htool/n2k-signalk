const createPlugin = require('./plugin')
const mapper = require('./n2kMapper')
const quirks = require('./quirks')

/**
 * Named mapper / quirk helpers stay on `exports` so
 * `import { N2kMapper } from '@signalk/n2k-signalk'` keeps working.
 * The plugin constructor is `exports.default` so Signal K's plugin
 * loader (`mod.default ?? mod`) picks it up.
 */
exports.N2kMapper = mapper.N2kMapper
exports.toDelta = mapper.toDelta
exports.toDeltaTransformer = mapper.toDeltaTransformer
exports.schema = quirks.schema
exports.uiSchema = quirks.uiSchema
exports.toCanboatQuirks = quirks.toCanboatQuirks
exports.toQuirkParameters = quirks.toQuirkParameters
exports.toCanboatOptions = quirks.toCanboatOptions
exports.applyQuirksToN2k = quirks.applyQuirksToN2k
exports.knownQuirks = quirks.knownQuirks
exports.default = createPlugin
