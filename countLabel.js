/*!
 * count-label.js
 * Turns the current view (filter + search) into a clear heading and sentence.
 *
 *   ShowcaseCount.describe({ shown: 1, total: 3, tag: 'css', query: '' })
 *   -> { title: 'css projects', sub: 'Showing 1 of 3 projects', empty: false }
 */
(function (root) {
  'use strict';

  function plural(count, one, many) {
    return count + ' ' + (count === 1 ? one : many);
  }

  function describe(o) {
    var shown = o.shown, total = o.total, tag = o.tag || '', q = (o.query || '').trim();

    if (!total) {
      return { title: 'All projects', sub: 'No projects yet', empty: true };
    }

    if (!tag && !q) {
      return { title: 'All projects', sub: plural(total, 'project', 'projects'), empty: false };
    }

    var title = tag ? tag + ' projects' : 'Search results';

    if (!shown) {
      var none = q ? 'No projects match \u201C' + q + '\u201D' : 'No projects tagged ' + tag;
      if (q && tag) none += ' in ' + tag;
      return { title: title, sub: none, empty: true };
    }

    var parts = 'Showing ' + shown + ' of ' + plural(total, 'project', 'projects');
    if (q) parts += ' matching \u201C' + q + '\u201D';
    return { title: title, sub: parts, empty: false };
  }

  root.ShowcaseCount = { describe: describe };
})(typeof window !== 'undefined' ? window : this);
