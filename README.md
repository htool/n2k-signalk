

n2k-signalk
================
[![Build Status](https://travis-ci.org/SignalK/n2k-signalk.svg?branch=master)](https://travis-ci.org/SignalK/n2k-signalk)


NMEA 2000 to Signal K (signalk.github.io) converter. Converts [Canboat analyzer](https://github.com/canboat/canboat/wiki/analyzer) JSON output to [SignalK](http://signalk.github.io/) JSON.

For mapping NMEA 0183 data to SignalK see [nmea0183-signalk](https://github.com/SignalK/nmea0183-signalk).


USAGE
-------------

**Usage from command line**


```
$ actisense-serial /dev/actisense | analyzer -json 2>/dev/null | n2k-signalk | head -5
{"environment":{"windSpeedApparent":{"value":2.93,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.384","src":"105"}}}}
{"environment":{"windAngleApparent":{"value":341.4,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.384","src":"105"}}}}
{"environment":{"windSpeedApparent":{"value":2.93,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.385","src":"105"}}}}
{"environment":{"windAngleApparent":{"value":341.4,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.385","src":"105"}}}}
{"environment":{"windSpeedApparent":{"value":2.93,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.385","src":"105"}}}}
$ actisense-serial /dev/actisense | analyzer -json 2>/dev/null | n2k-signalk --flat | head -5
{"path":"environment.windSpeedApparent","value":2.93,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.384","src":"105"}}
{"path":"environment.windAngleApparent","value":341.4,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.384","src":"105"}}
{"path":"environment.windSpeedApparent","value":2.93,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.385","src":"105"}}
{"path":"environment.windAngleApparent","value":341.4,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.385","src":"105"}}
{"path":"environment.windSpeedApparent","value":2.93,"source":{"pgn":"130306","timestamp":"2013-08-24-15:31:50.385","src":"105"}}
```



**Usage as stream transformer**

See [bin/n2k-signalk](https://github.com/SignalK/n2k-signalk/blob/master/bin/n2k-signalk).

**Usage for a single transformation**

See [bin/demo.js](https://github.com/SignalK/n2k-signalk/blob/master/bin/demo.js).


### Custom Sentences

You can add custom n2k mappings via the [Signal K Server plugin mechanism](https://github.com/SignalK/signalk-server/blob/master/SERVERPLUGINS.md). A plugin can register custom mappings by emitting `pgn-to-signalk` PropertyValues with a value that is a map with the pgn number has the key and the n2k mappings as the value.

See [signalk-over-n2k](https://github.com/SignalK/signalk-over-n2k) for an example.

### Quirks

canboatjs can cover for known device misbehaviour via opt-in **quirks** (the same names canboat's `--quirk` flag uses). They stay off by default because enabling one will also "correct" data that was never wrong — for example replaying a pre-2019 capture with GPS week rollover on moves the whole log forward twenty years.

When this package is loaded as a Signal K server plugin, **Plugin Config** shows a Quirks section. Each quirk is a toggle, plus any parameters that quirk expects. Enabled quirks are published as `canboatjs-quirks` PropertyValues and applied during NMEA 2000 to Signal K conversion.

The GPS week rollover quirk (`gps-rollover`) corrects dates from a GNSS receiver that missed the 1024-week wrap (PGNs 129029, 129033, and 126992 when its source is GPS).

You can also pass quirks when constructing the mapper or the canboatjs parser:

```js
const { N2kMapper, toCanboatOptions } = require('@signalk/n2k-signalk')
const { FromPgn } = require('@canboat/canboatjs')

const settings = {
  quirks: {
    'gps-rollover': { enabled: true }
  }
}

const mapper = new N2kMapper(settings)
const parser = new FromPgn(toCanboatOptions(settings))
```
