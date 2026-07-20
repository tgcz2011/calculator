// en-US dictionary — mirrors zh.ts. Keep keys 1:1 so the i18n module's
// fallback (zh) catches every missing string during development.
export const en: Record<string, string> = {
  // TabBar / modes
  'mode.basic': 'Basic',
  'mode.scientific': 'Scientific',
  'mode.history': 'History',
  'mode.programmer': 'Programmer',
  'mode.units': 'Units',
  'mode.date': 'Date',
  'mode.angle.deg': 'Degree',
  'mode.angle.rad': 'Radian',

  // Common UI
  'common.sync': 'Sync',
  'common.syncSettings': 'Sync settings',
  'common.theme.light': 'Switch to dark theme',
  'common.theme.dark': 'Switch to light theme',
  'common.lang.zh': 'Switch to Chinese',
  'common.lang.en': 'Switch to English',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.clear': 'Clear',

  // Picker (home)
  'picker.title': 'Choose a calculator',
  'picker.subtitle': 'Pick one to get started — more on the way',
  'picker.tile.basic.title': 'Basic',
  'picker.tile.basic.desc': 'Everyday arithmetic',
  'picker.tile.scientific.title': 'Scientific',
  'picker.tile.scientific.desc': 'Trig, logs, powers',
  'picker.tile.programmer.title': 'Programmer',
  'picker.tile.programmer.desc': 'Radix conversion and bitwise ops',
  'picker.tile.units.title': 'Units',
  'picker.tile.units.desc': 'Length, mass, temperature, currency',
  'picker.tile.date.title': 'Date',
  'picker.tile.date.desc': 'Date diff and weekday',
  'picker.tile.history.title': 'History',
  'picker.tile.history.desc': 'Review past calculations',
  'picker.locked': 'Coming soon',

  // Display errors (engine returns Chinese strings; rebuild via i18n.ts:localizeErrorMessage)
  'error.UNCLOSED': 'Expression incomplete',
  'error.PAREN': 'Mismatched parentheses',
  'error.MISSING_OPERAND': 'Missing operand',
  'error.UNKNOWN_SYMBOL': 'Unknown symbol',
  'error.NOT_FUNCTION': 'Undefined function',
  'error.CONVERT': 'Cannot convert',
  'error.ENGINE': 'Calculation error',

  // Keypad
  'key.allClear': 'All clear',
  'key.clear': 'Clear',
  'key.negate': 'Negate',
  'key.percent': 'Percent',
  'key.divide': 'Divide',
  'key.multiply': 'Multiply',
  'key.subtract': 'Subtract',
  'key.add': 'Add',
  'key.equals': 'Equals',
  'key.openParen': 'Open parenthesis',
  'key.closeParen': 'Close parenthesis',
  'key.backspace': 'Backspace',

  // HistoryList
  'history.empty.title': 'No history yet',
  'history.empty.desc': 'Calculations you run will appear here',
  'history.clear': 'Clear',
};