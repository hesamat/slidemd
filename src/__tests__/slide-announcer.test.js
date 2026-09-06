// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

// We test DeckController.render's slide announcement by binding the method to
// a stub that provides only the fields the method reads. This avoids
// constructing the full DeckController (which wires up many subsystems).
import { DeckController } from "../engine/deck-controller.js";

describe("DeckController slide announcement", () => {
  let announcer;
  let slidesContainer;
  let stub;
  const slide0 = { id: "s0", title: "First", areas: { main: "<p>Hello</p>" } };
  const slide1 = { id: "s1", title: "Second", areas: { main: "<p>World</p>" } };
  const hidden = { id: "s2", title: "Hidden", hidden: true, areas: { main: "" } };

  function makeStub(slides, currentIndex) {
    return {
      elements: { slideAnnouncer: announcer, slidesContainer },
      deck: { slides },
      slideNavigator: { currentIndex },
      roleManager: { isEditorWindow: false },
      // render() delegates the announcement to this method; provide the
      // prototype implementation so the stub behaves like the real object.
      getSlideAnnouncement: DeckController.prototype.getSlideAnnouncement,
    };
  }

  beforeEach(() => {
    announcer = document.createElement("div");
    slidesContainer = document.createElement("div");
    slidesContainer.innerHTML =
      '<div class="slide"></div><div class="slide"></div><div class="slide"></div>';
    stub = makeStub([slide0, slide1, hidden], 0);
    stub.elements.slideNumberEl = document.createElement("span");
  });

  it("announces the active slide title and visible count", () => {
    stub.slideNavigator.currentIndex = 1;
    DeckController.prototype.render.call(stub);
    expect(announcer.textContent).toBe("Slide 2 of 2: Second");
  });

  it("announces without a colon when the slide has no title", () => {
    stub.deck.slides = [{ id: "s0", areas: { main: "" } }];
    stub.slideNavigator.currentIndex = 0;
    DeckController.prototype.render.call(stub);
    expect(announcer.textContent).toBe("Slide 1 of 1");
  });

  it("does not count hidden slides in the announcement total", () => {
    DeckController.prototype.render.call(stub);
    expect(announcer.textContent).toBe("Slide 1 of 2: First");
  });

  it("strips markup from slide titles like the slide aria-label does", () => {
    stub.deck.slides = [{ id: "s0", title: "<b>Bold</b> Title", areas: { main: "" } }];
    DeckController.prototype.render.call(stub);
    expect(announcer.textContent).toBe("Slide 1 of 1: Bold Title");
  });

  it("is a no-op when the announcer element is missing", () => {
    stub.elements.slideAnnouncer = null;
    expect(() => DeckController.prototype.render.call(stub)).not.toThrow();
  });

  it("matches the format of the slide wrapper aria-label", () => {
    DeckController.prototype.render.call(stub);
    const slideEl = slidesContainer.querySelectorAll(".slide")[0];
    slideEl.setAttribute("aria-label", announcer.textContent);
    expect(slideEl.getAttribute("aria-label")).toBe("Slide 1 of 2: First");
  });

  it("updates the announcement text on every navigation step", () => {
    DeckController.prototype.render.call(stub);
    stub.slideNavigator.currentIndex = 2;
    DeckController.prototype.render.call(stub);
    expect(announcer.textContent).toBe("Slide 3 of 2: Hidden");
  });
});
