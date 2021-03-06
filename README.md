
This fork is specifically created for https://github.com/janisdd/vscode-edit-csv because I want to keep the MIT license (and also MIT for the vs code plugin) which was only valid until (including) handsontable version 6.2.2 (https://github.com/janisdd/handsontable)

**Note that the dist might not be up to date (!!!), you need to run `npm run build` to get the output (`dist/`)**

*For development you can run `build:umd` for faster build times*

Below is a list of changes made to this repo (latest first)

- autoColumnSize doube click auto resize now works properly even if the plugin is disabled

- sort plugin now supports multi column sorting (always enabled)
  - sue ctrl/cmd to sort by the next column

- fixed issue where `fixedRowsTop` and `fixedColumnsLeft` could not be changed/set after we removed a row/col

- fix for issue https://github.com/handsontable/handsontable/issues/6232
- fixed issue where setting `wordWrap: false` will not display new lines any more
  - this cannot be easily merged into handsontable because the fix will always preserve whitespace even if `trimWhitespace: true` which will break the current behaviour of handsontalbe
  - current behaviour is - `trimWhitespace: true` then whitespace (and new lines) is collapsed visually and trim is applied after cell edit
  - behaviour after fix is - `trimWhitespace: true` then whitespace (and new lines) is visible and trim is applied after cell edit
  - see https://github.com/handsontable/handsontable/issues/6232#issuecomment-531555056 for some more information
- added option `autoColumnSize` to Plugin `maxColumnWidth` (number|function) which allows to specify a max width for the very first render
  - usage:
    ```typescript
    let hand = {
      autoColumnSize: {
        maxColumnWidth: function(columnIndex: number, column_width: number) {
          # columnIndex is visual or physical?? probably visual TODO
          # you can return a new width here...
        }
      }
    }
    let hand2 = {
      autoColumnSize: {
        maxColumnWidth: 300
      }
    }
    ```

- modified search plugin to support
  - suspend (swap match css class with another one)
  - async search to update ui and support cancelling

---

<div align="center">
  <a href="//handsontable.com" target="_blank"><img src="https://raw.githubusercontent.com/handsontable/static-files/master/Images/Logo/Handsontable/Handsontable-logo-300-74-new.png" alt="Handsontable Community Edition logo" /></a>
</div>

<br/>

[**Handsontable Community Edition (CE)**](//handsontable.com) is an open source JavaScript/HTML5 data grid component with spreadsheet look & feel. It easily integrates with any data source and comes with a variety of useful features like data binding, validation, sorting or powerful context menu. It is available for [Vue](//github.com/handsontable/vue-handsontable-official), [React](//github.com/handsontable/react-handsontable), [Angular](//github.com/handsontable/angular-handsontable) and [Polymer](//github.com/handsontable/hot-table).

If you are looking for an extended version, try out [Handsontable Pro](//github.com/handsontable/handsontable-pro).

[![Build status](https://travis-ci.org/handsontable/handsontable.png?branch=master)](//travis-ci.org/handsontable/handsontable)
[![npm](https://img.shields.io/npm/dt/handsontable.svg)](//npmjs.com/package/handsontable)
[![npm](https://img.shields.io/npm/dm/handsontable.svg)](//npmjs.com/package/handsontable)
[![npm](https://img.shields.io/github/contributors/handsontable/handsontable.svg)](//github.com/handsontable/handsontable/graphs/contributors)


----

**We are looking for Contributors who would like to help us with translations. [Learn more](https://github.com/handsontable/handsontable/issues/4696)**
<br/>
Most wanted languages: Danish, Portuguese, Spanish and Swedish.

---

<br/>

## Table of contents

1. [What to use it for?](#what-to-use-it-for)
1. [Installation](#installation)
2. [Basic usage](#basic-usage)
3. [Examples](#examples)
4. [Features](#features)
5. [Screenshot](#screenshot)
6. [Resources](#resources)
7. [Wrappers](#wrappers)
8. [Support](#support)
9. [Contributing](#contributing)
10. [Community](#community)
11. [License](#license)

<br/>

### What to use it for?
The list below gives a rough idea on what you can do with Handsontable CE, but it shouldn't limit you in any way:

- Database editing
- Configuration controlling
- Data merging
- Team scheduling
- Sales reporting
- Financial analysis

<br/>

### Installation
There are many ways to install Handsontable CE, but we suggest using npm:
```
npm install handsontable
```

**Alternative ways to install**
- See the [download section](//handsontable.com/community-download) on how to install Handsontable CE using nuget, bower, yarn and more.

<br/>

### Basic usage
Assuming that you have already installed Handsontable CE, create an empty `<div>` element that will be turned into a spreadsheet:

```html
<div id="example"></div>
```
In the next step, pass a reference to that `<div>` element into the Handsontable CE constructor and fill the instance with sample data:
```javascript
var data = [
  ["", "Tesla", "Volvo", "Toyota", "Honda"],
  ["2017", 10, 11, 12, 13],
  ["2018", 20, 11, 14, 13],
  ["2019", 30, 15, 12, 13]
];

var container = document.getElementById('example');
var hot = new Handsontable(container, {
  data: data,
  rowHeaders: true,
  colHeaders: true
});
```

<br/>

### Examples
- [See a live demo](//handsontable.com/examples.html)

<br/>

### Features

**Some of the most popular features include:**

- Sorting data
- Data validation
- Conditional formatting
- Freezing rows/columns
- Merging cells
- Defining custom cell types
- Moving rows/columns
- Resizing rows/columns
- Context menu
- Adding comments to cells
- Dragging fill handle to populate data
- Internationalization
- Non-contiguous selection

[See a comparison table](//handsontable.com/docs/tutorial-features.html)

<br/>

### Screenshot
<div align="center">
<a href="//handsontable.com/examples.html">
<img src="https://raw.githubusercontent.com/handsontable/static-files/master/Images/Screenshots/handsontable-ce-showcase.png" align="center" alt="Handsontable Community Edition Screenshot"/>
</a>
</div>

<br/>

### Resources
- [API Reference](//handsontable.com/docs/Core.html)
- [Compatibility](//handsontable.com/docs/tutorial-compatibility.html)
- [Change log](//github.com/handsontable/handsontable/releases)
- [Roadmap](//trello.com/b/PztR4hpj)
- [Newsroom](//twitter.com/handsontable)

<br/>

### Wrappers
Handsontable CE comes with wrappers and directives for most popular frameworks:

- [Angular](//github.com/handsontable/angular-handsontable)
- [Angular 1](//github.com/handsontable/ngHandsontable)
- [React](//github.com/handsontable/react-handsontable)
- [Vue](//github.com/handsontable/vue-handsontable-official)
- [Polymer](//github.com/handsontable/hot-table)
- [Typescript file](//github.com/handsontable/handsontable/blob/master/handsontable.d.ts)

<br/>

### Support
Report all the suggestions and problems on [GitHub Issues](//github.com/handsontable/handsontable/issues).

An open source version doesn't include a commercial support. You need to purchase [Handsontable Pro](//github.com/handsontable/handsontable-pro) license or [contact us](//handsontable.com/contact.html) directly in order to obtain a technical support from the Handsoncode team.

<br/>

### Contributing
If you would like to help us to develop Handsontable, please take a look at this [guide for contributing](//github.com/handsontable/handsontable/blob/master/CONTRIBUTING.md).

<br/>

### Community
- [GitHub issues](//github.com/handsontable/handsontable/issues)
- [Stackoverflow](//stackoverflow.com/tags/handsontable)
- [Forum](//forum.handsontable.com)
- [Twitter](//twitter.com/handsontable)

<br/>

### License
Handsontable Community Edition is released under the MIT license. [Read license](//github.com/handsontable/handsontable/blob/master/LICENSE).

Copyrights belong to Handsoncode sp. z o.o.
