// zh-CN dictionary — canonical authoring source. en.ts mirrors this.
export const zh: Record<string, string> = {
  // TabBar / modes
  'mode.basic': '基础',
  'mode.scientific': '科学',
  'mode.history': '历史',
  'mode.programmer': '程序员',
  'mode.units': '单位',
  'mode.date': '日期',
  'mode.angle.deg': '角度',
  'mode.angle.rad': '弧度',

  // Common UI
  'common.sync': '同步',
  'common.syncSettings': '同步设置',
  'common.theme.light': '切换到深色主题',
  'common.theme.dark': '切换到浅色主题',
  'common.lang.zh': '切换到英文',
  'common.lang.en': '切换到中文',
  'common.close': '关闭',
  'common.back': '返回',
  'common.clear': '清空',

  // Picker (home)
  'picker.title': '选择计算器',
  'picker.subtitle': '挑一个开始用，更多类型在路上',
  'picker.tile.basic.title': '基础',
  'picker.tile.basic.desc': '加减乘除，日常生活',
  'picker.tile.scientific.title': '科学',
  'picker.tile.scientific.desc': '三角函数、对数、幂',
  'picker.tile.programmer.title': '程序员',
  'picker.tile.programmer.desc': '进制转换与位运算',
  'picker.tile.units.title': '单位',
  'picker.tile.units.desc': '长度、重量、温度、货币',
  'picker.tile.date.title': '日期',
  'picker.tile.date.desc': '日期间隔、星期',
  'picker.tile.history.title': '历史',
  'picker.tile.history.desc': '查看之前的算式',
  'picker.locked': '即将推出',

  // Display error messages (engine-side classification in Chinese; en rebuilt
  // from code in i18n/index.ts:tError)
  'error.UNCLOSED': '表达式未闭合',
  'error.PAREN': '括号不匹配',
  'error.MISSING_OPERAND': '缺少操作数',
  'error.UNKNOWN_SYMBOL': '未知符号',
  'error.NOT_FUNCTION': '函数未定义',
  'error.CONVERT': '类型无法转换',
  'error.ENGINE': '计算错误',

  // Keypad
  'key.allClear': '清除所有',
  'key.clear': '清除',
  'key.negate': '取负',
  'key.percent': '百分号',
  'key.divide': '除',
  'key.multiply': '乘',
  'key.subtract': '减',
  'key.add': '加',
  'key.equals': '等于',
  'key.openParen': '左括号',
  'key.closeParen': '右括号',
  'key.backspace': '退格',

  // HistoryList
  'history.empty.title': '还没有历史',
  'history.empty.desc': '计算后会自动出现在这里',
  'history.clear': '清空',
};