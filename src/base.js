// ✊🏿

'use strict';

/**
  A base class for most other classes. Accepts options.
**/
const Base = class {

  constructor (_options) {

    this._options = JSON.parse(JSON.stringify(_options || {}));

    return this;
  }

  get options () {

    return this._options;
  }
};

/* Export symbols */
module.exports = Base;

