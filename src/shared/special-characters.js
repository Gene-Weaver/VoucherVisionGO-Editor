/**
 * Character palette for the Special Characters popup.
 *
 * To add a new section, append an object to the array below. `id` must be
 * unique and URL-safe; `label` appears in the dropdown and as the section
 * header; `chars` is the list of glyphs rendered as buttons in order.
 *
 * Pure data module — no DOM or Node deps — so it loads in both the renderer
 * (<script> tag) and a Node context (require()).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.SPECIAL_CHARACTERS = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return [
    {
      id: 'latin-supplement',
      label: 'Latin Supplement',
      chars: [
        'Š', '‹', 'Œ', 'Ž',
        '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', 'ž', 'Ÿ',
        '¡', '¢', '£', '¤', '¥', '¦', '§', '¨', '©', 'ª', '«', '¬', '®', '¯',
        '°', '±', '²', '³', '´', 'µ', '¶', '·', '¸', '¹', 'º', '»', '¼', '½', '¾', '¿',
        'À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Æ', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì', 'Í', 'Î', 'Ï',
        'Ð', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', '×', 'Ø', 'Ù', 'Ú', 'Û', 'Ü', 'Ý', 'Þ', 'ß',
        'à', 'á', 'â', 'ã', 'ä', 'å', 'æ', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï',
        'ð', 'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', '÷', 'ø', 'ù', 'ú', 'û', 'ü', 'ý', 'þ', 'ÿ',
      ],
    },
    {
      id: 'sex-symbols',
      label: 'Sex Symbols',
      chars: ['♂', '♀', '⚥'],
    },
    {
      id: 'currency',
      label: 'Currency Symbols',
      chars: [
        '₠', '₡', '₢', '₣', '₤', '₥', '₦', '₧', '₨', '₩', '₪', '₫',
        '€', '₭', '₮', '₯', '₰', '₱', '₲', '₳', '₴', '₵', '₶', '₷',
        '₸', '₹', '₺', '₻', '₼', '₽', '₾', '₿',
      ],
    },
    {
      id: 'roman-numerals',
      label: 'Roman Numerals',
      chars: [
        'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ',
        'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', 'Ⅼ', 'Ⅽ', 'Ⅾ', 'Ⅿ',
        'ⅰ', 'ⅱ', 'ⅲ', 'ⅳ', 'ⅴ', 'ⅵ', 'ⅶ', 'ⅷ',
        'ⅸ', 'ⅹ', 'ⅺ', 'ⅻ', 'ⅼ', 'ⅽ', 'ⅾ', 'ⅿ',
      ],
    },
  ];
});
