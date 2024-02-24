import PlatformInterface from "../platformInterface"

class Platform implements PlatformInterface {
  getTermDefaultShortKey() {
    return {
      "copy": ["⌘ + c", {
        code: 67,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false
      }, (term) => {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
        }
      }],
      "paste": ["⌘ + v", {
        code: 86,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false
      }, (term) => {
        if (navigator.clipboard.readText) {
          navigator.clipboard.readText().then((text) => {
            term.write(text);
          });
        }
        // else {
        //   term.write(navigator.clipboard);
        // }
      }]
    }
  }
}

export default new Platform();
