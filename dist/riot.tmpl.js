
/**
 * The riot template engine
 * @module tmpl
 * @version "0"
 */

// lib/brackets.js

var brackets = function (onchange, UNDEF) {

  var
    REGLOB  = 'g',

    MLCOMMS = /\/\*[^*]*\*+(?:[^*\/][^*]*\*+)*\//g,
    STRINGS = /"[^"\\]*(?:\\[\S\s][^"\\]*)*"|'[^'\\]*(?:\\[\S\s][^'\\]*)*'/g,

    S_QBSRC = STRINGS.source + '|' +
      /(?:[$\w\)\]]|\+\+|--)\s*(\/)(?![*\/])/.source + '|' +
      /\/(?=[^*\/])[^[\/\\]*(?:(?:\[(?:\\.|[^\]\\]*)*\]|\\.)[^[\/\\]*)*?(\/)[gim]*/.source,

    DEFAULT = '{ }',

    FINDBRACES = {
      '(': _regExp('([()])|'   + S_QBSRC, REGLOB),
      '[': _regExp('([[\\]])|' + S_QBSRC, REGLOB),
      '{': _regExp('([{}])|'   + S_QBSRC, REGLOB)
    }

  var
    cachedBrackets = UNDEF,
    _regex,
    _pairs = []

  function _regExp(source, flags) { return new RegExp(source, flags) }

  function _loopback(re) { return re }

  function _rewrite(re) {
    return new RegExp(
      re.source.replace(/{/g, _pairs[2]).replace(/}/g, _pairs[3]), re.global ? REGLOB : ''
    )
  }

  function _reset(pair) {
    pair = pair || DEFAULT

    if (pair !== _pairs[8]) {
      var bp = pair.split(' ')

      if (pair === DEFAULT) {
        _pairs = bp.concat(bp)
        _regex = _loopback
      }
      else {
        if (bp.length !== 2 || /[\x00-\x1F<>a-zA-Z0-9'",;\\]/.test(pair)) {
          throw new Error('Unsupported brackets "' + pair + '"')
        }
        _pairs = bp.concat(pair.replace(/(?=[[\]()*+?.^$|])/g, '\\').split(' '))
        _regex = _rewrite
      }
      _pairs[4] = _regex(_pairs[1].length > 1 ? /(?:^|[^\\]){[\S\s]*?}/ : /(?:^|[^\\]){[^}]*}/)
      _pairs[5] = _regex(/\\({|})/g)
      _pairs[6] = _regex(/(\\?)({)/g)
      _pairs[7] = _regExp('(\\\\?)(?:([[({])|(' + _pairs[3] + '))|' + S_QBSRC, REGLOB)
      _pairs[8] = pair
    }
    _brackets.settings.brackets = cachedBrackets = pair
  }

  function _set(pair) {
    if (cachedBrackets !== pair) {
      _reset(pair)
      if (onchange) onchange(_pairs)
    }
  }

  function _brackets(reOrIdx) {
    _set(_brackets.settings.brackets)
    return reOrIdx instanceof RegExp ? _regex(reOrIdx) : _pairs[reOrIdx]
  }

  _brackets.split = function split(str, tmpl) {

    var
      parts = [],
      match,
      isexpr,
      start,
      pos,
      re = _pairs[6]

    isexpr = start = re.lastIndex = 0

    while (match = re.exec(str)) {

      pos = match.index

      if (isexpr) {

        if (match[2]) {
          re.lastIndex = skipBraces(match[2], re.lastIndex)
          continue
        }

        if (!match[3])
          continue
      }

      if (!match[1]) {
        unescapeStr(str.slice(start, pos))
        start = re.lastIndex
        re = _pairs[6 + (isexpr ^= 1)]
        re.lastIndex = start
      }
    }

    if (str && start < str.length) {
      unescapeStr(str.slice(start))
    }

    return parts

    function unescapeStr(str) {
      if (tmpl || isexpr)
        parts.push(str && str.replace(_pairs[5], '$1'))
      else
        parts.push(str)
    }

    function skipBraces(ch, pos) {
      var
        match,
        recch = FINDBRACES[ch],
        level = 1
      recch.lastIndex = pos

      while (match = recch.exec(str)) {
        if (match[1] &&
          !(match[1] === ch ? ++level : --level)) break
      }
      return match ? recch.lastIndex : str.length
    }
  }

  _brackets.array = function array(pair) {
    if (pair != null) _reset(pair)
    return _pairs
  }

  /* istanbul ignore next: in the node version riot is not in the scope */
  _brackets.settings = typeof riot !== 'undefined' && riot.settings || {}
  _brackets.set = _set

  _brackets.R_STRINGS = STRINGS
  _brackets.R_MLCOMMS = MLCOMMS
  _brackets.S_QBLOCKS = S_QBSRC

  _reset(_brackets.settings.brackets)

  return _brackets

}

// lib/tmpl.js

/**
 * @module tmpl
 *
 * tmpl          - Root function, returns the template value, render with data
 * tmpl.hasExpr  - Test the existence of a expression inside a string
 * tmpl.loopKeys - Get the keys for an 'each' loop (used by `_each`)
 */

var tmpl = (function () {

  var
    FALSE   = !1,
    _cache  = {},
    _reKeys,
    _bp

  brackets = brackets(_changebp)
  _changebp(brackets.array())

  function _tmpl(str, data) {
    if (!str) return str

    return (_cache[str] || (_cache[str] = _create(str))).call(data, _logErr)
  }

  _tmpl.hasExpr = function hasExpr(str) {
    return _bp[4].test(str)
  }

  _tmpl.loopKeys = function loopKeys(expr) {
    var m = expr.match(_reKeys)
    return m ?
      { key: m[1], pos: m[2], val: _bp[0] + m[3] + _bp[1] } : { val: expr.trim() }
  }

  _tmpl.errorHandler = FALSE

  function _logErr(err, ctx) {

    if (_tmpl.errorHandler) {

      err.riotData = {
        tagName: ctx.root && ctx.root.tagName,
        _riot_id: ctx._riot_id  //eslint-disable-line camelcase
      }
      _tmpl.errorHandler(err)
    }
  }

  function _changebp(bp) {
    _bp = bp
    _reKeys = brackets(/^\s*{\^?\s*([$\w]+)(?:\s*,\s*(\S+))?\s+in\s+(\S+)\s*}/)
  }

  function _create(str) {

    var expr = _getTmpl(str)
    if (expr.slice(0, 11) !== "try{return ") expr = 'return ' + expr

    return new Function('E', expr + ';')  // eslint-disable-line indent
  }

  var
    RE_QBLOCK = new RegExp(brackets.S_QBLOCKS, 'g'),
    RE_QBMARK = /\x01(\d+)~/g

  function _getTmpl(str) {
    var
      qstr = [],
      expr,
      parts = brackets.split(str, 1)

    if (parts.length > 2 || parts[0]) {
      var i, j, list = []

      for (i = j = 0; i < parts.length; ++i) {

        expr = parts[i]

        if (expr && (expr = i & 1 ?

              _parseExpr(expr, 1, qstr) :

              '"' + expr
                .replace(/\\/g, '\\\\')
                .replace(/\r\n?|\n/g, '\\n')
                .replace(/"/g, '\\"') +
              '"'

          )) list[j++] = expr

      }

      expr = j < 2 ? list[0] :
             '[' + list.join(',') + '].join("")'
    }
    else {

      expr = _parseExpr(parts[1], 0, qstr)
    }

    if (qstr[0])
      expr = expr.replace(RE_QBMARK, function (_, pos) {
        return qstr[pos]
          .replace(/\r/g, '\\r')
          .replace(/\n/g, '\\n')
      })

    return expr
  }

  var
    CS_IDENT = /^(?:(-?[_A-Za-z\xA0-\xFF][-\w\xA0-\xFF]*)|\x01(\d+)~):/,
    RE_BRACE = /,|([[{(])|$/g

  function _parseExpr(expr, asText, qstr) {

    expr = expr
          .replace(RE_QBLOCK, function (s, div) {
            return s.length > 2 && !div ? '\x01' + (qstr.push(s) - 1) + '~' : s
          })
          .replace(/\s+/g, ' ').trim()
          .replace(/\ ?([[\({},?\.:])\ ?/g, '$1')

    if (expr) {
      var
        list = [],
        cnt = 0,
        match

      while (expr &&
            (match = expr.match(CS_IDENT)) &&
            !match.index
        ) {
        var
          key,
          jsb,
          re = /,|([[{(])|$/g

        expr = RegExp.rightContext
        key  = match[2] ? qstr[match[2]].slice(1, -1).trim().replace(/\s+/g, ' ') : match[1]

        while (jsb = (match = re.exec(expr))[1]) skipBraces(jsb, re)

        jsb  = expr.slice(0, match.index)
        expr = RegExp.rightContext

        list[cnt++] = _wrapExpr(jsb, 1, key)
      }

      expr = !cnt ? _wrapExpr(expr, asText) :
          cnt > 1 ? '[' + list.join(',') + '].join(" ").trim()' : list[0]
    }
    return expr

    function skipBraces(jsb, re) {
      var
        match,
        lv = 1,
        ir = jsb === '(' ? /[()]/g : jsb === '[' ? /[[\]]/g : /[{}]/g

      ir.lastIndex = re.lastIndex
      while (match = ir.exec(expr)) {
        if (match[0] === jsb) ++lv
        else if (!--lv) break
      }
      re.lastIndex = lv ? expr.length : ir.lastIndex
    }
  }

  var JS_VARNAME = /[,{][$\w]+:|(^ *|[^$\w\.])(?!(?:typeof|true|false|null|undefined|in|instanceof|is(?:Finite|NaN)|void|NaN|new|Date|RegExp|Math)(?![$\w]))([$_A-Za-z][$\w]*)/g
  var JS_CONTEXT = '"in this?this:' + (typeof window !== 'object' ? 'global' : 'window') + ').'

  function _wrapExpr(expr, asText, key) {
    var tb = FALSE

    expr = expr.replace(JS_VARNAME, function (match, p, mvar) {
      if (mvar) {
        var s = tb ? FALSE : RegExp.rightContext

        if (mvar !== 'this' && mvar !== 'global' && mvar !== 'window') {
          match = p + '("' + mvar + JS_CONTEXT + mvar
          if (s) tb = /^[.[(]/.test(s)
        }
        else if (s)
          tb = !/^(?=(\.[$\w]+))\1(?:[^.[(]|$)/.test(s)
      }
      return match
    })

    if (tb) {
      expr = "try{return " + expr + '}catch(e){E(e,this)}'
    }

    if (key) {

      expr = (tb ?
          'function(){' + expr + '}.call(this)' : '(' + expr + ')'
        ) + '?"' + key + '":""'
    }
    else if (asText) {

      expr = 'function(v){' + (tb ?
          expr.replace('return ', 'v=') : 'v=(' + expr + ')'
        ) + ';return v||v===0?v:""}.call(this)'
    }

    return expr
  }

  return _tmpl

})()

