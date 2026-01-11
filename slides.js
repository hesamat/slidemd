// Initialize deck by loading slides.json and wiring presenter logic
(function () {
    async function loadSlidesJson(path = "slides.json") {
        const res = await fetch(path, { cache: "no-cache" });
        if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
        return res.json();
    }

    async function init() {
        const slides = await loadSlidesJson();

        const SLIDE_STATE_KEY = "webdeck_current_slide";
        const ROLE_KEY = "webdeck_role"; // 'presenter' or 'viewer'

        let currentIndex = 0;
        let isPresenterWindow = false;
        let presenterWindowRef = null;

        const urlParams = new URLSearchParams(window.location.search);
        const roleFromUrl = urlParams.get("role");
        if (roleFromUrl === "presenter") {
            isPresenterWindow = true;
            localStorage.setItem(ROLE_KEY, "presenter");
        } else if (roleFromUrl === "viewer") {
            isPresenterWindow = false;
            localStorage.setItem(ROLE_KEY, "viewer");
        } else {
            const storedRole = localStorage.getItem(ROLE_KEY);
            isPresenterWindow = storedRole === "presenter";
        }

        let bc = null;
        try {
            bc = new BroadcastChannel("webdeck_channel");
        } catch (e) {
            bc = null;
        }

        function broadcastState(index) {
            const payload = { type: "slide", index };
            if (bc) bc.postMessage(payload);
            localStorage.setItem(SLIDE_STATE_KEY, String(index));
        }

        function handleIncomingState(index) {
            if (typeof index !== "number" || isNaN(index)) return;
            if (index < 0 || index >= slides.length) return;
            currentIndex = index;
            render();
        }

        if (bc) {
            bc.onmessage = (event) => {
                const msg = event.data;
                if (!msg || typeof msg !== "object") return;
                if (msg.type === "slide" && typeof msg.index === "number") {
                    handleIncomingState(msg.index);
                }
            };
        }

        window.addEventListener("storage", (ev) => {
            if (ev.key === SLIDE_STATE_KEY && ev.newValue != null) {
                const idx = parseInt(ev.newValue, 10);
                handleIncomingState(idx);
            }
        });

        const slidesContainer = document.getElementById("slidesContainer");
        const slideNumberEl = document.getElementById("slideNumber");
        const slideCountEl = document.getElementById("slideCount");
        const roleLabelEl = document.getElementById("roleLabel");
        const togglePresenterBtn = document.getElementById("togglePresenterBtn");
        const printBtn = document.getElementById("printBtn");
        const presenterPanel = document.getElementById("presenterPanel");
        const nextPreview = document.getElementById("nextPreview");
        const notesContainer = document.getElementById("notesContainer");
        const controlBar = document.getElementById("controlBar");
        const footerBar = document.getElementById("footerBar");
        const viewerPresenterBtn = document.getElementById("viewerPresenterBtn");

        slideCountEl.textContent = String(slides.length);

        function applyOptionalClasses(el, cls) {
            if (!cls || typeof cls !== "string") return;
            cls.split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
        }

        function stripHtml(input) {
            if (typeof input !== "string") return "";
            const div = document.createElement("div");
            div.innerHTML = input;
            return (div.textContent || div.innerText || "").trim();
        }

        // Build a small footer with a reference link/text if provided on the slide
        function makeReferenceFooter(slide) {
            const url =
                slide.referenceUrl ||
                slide.referenceLink ||
                (typeof slide.reference === "string" && /^https?:\/\//i.test(slide.reference)
                    ? slide.reference
                    : null);

            const labelCandidate =
                slide.referenceLabel ||
                slide.referenceText ||
                (typeof slide.reference === "string" && !url ? slide.reference : null) ||
                (url ? (() => { try { return new URL(url).hostname; } catch { return null; } })() : null);

            if (!url && !labelCandidate) return null;

            const footer = document.createElement("div");
            footer.className = "mt-4 text-xs md:text-sm text-slate-500 shrink-0";

            if (url) {
                const a = document.createElement("a");
                a.href = url;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.className = "underline hover:text-slate-700";
                a.textContent = labelCandidate || url;
                footer.appendChild(a);
            } else {
                const span = document.createElement("span");
                span.textContent = labelCandidate || "";
                footer.appendChild(span);
            }

            return footer;
        }

        function createSlideElement(slide, index) {
            const wrapper = document.createElement("div");
            wrapper.className =
                "slide w-full h-full p-8 md:p-12 2xl:p-30 text-slate-900 bg-white" +
                (index === currentIndex ? " active" : "");
            wrapper.setAttribute("role", "region");
            wrapper.setAttribute("aria-roledescription", "slide");
            wrapper.setAttribute(
                "aria-label",
                `Slide ${index + 1} of ${slides.length}${slide.title ? `: ${stripHtml(slide.title)}` : ""}`
            );
            applyOptionalClasses(wrapper, slide.wrapperClass);

            const TITLE_CLASS =
                "text-3xl 2xl:text-5xl font-bold tracking-tight leading-tight break-words max-w-full";
            const SUBTITLE_CLASS = "mt-10 text-lg md:text-xl 2xl:text-2xl text-slate-600 text-center";
            const BODY_TEXT_CLASS = "text-lg md:text-xl 2xl:text-2xl text-slate-700 whitespace-pre-line";
            const BULLET_DOT_CLASS = "2xl:text-2xl text-emerald-600 ";

            const inner = document.createElement("div");
            inner.className = "w-full h-full flex flex-col";
            applyOptionalClasses(inner, slide.innerClass);

            const header = document.createElement("div");
            header.className = "w-full";
            if (slide.title) {
                const h1 = document.createElement("h1");
                h1.className = TITLE_CLASS;
                h1.innerHTML = slide.title;
                header.appendChild(h1);
            }
            if (slide.subtitle) {
                const subtitle = document.createElement("p");
                subtitle.className = SUBTITLE_CLASS;
                subtitle.innerHTML = slide.subtitle;
                header.appendChild(subtitle);
            }
            if (header.childNodes.length && !(slide.layout === "title-center" || slide.layout === "center-big")) {
                inner.appendChild(header);
            }

            const body = document.createElement("div");
            body.className = "flex-1 min-h-0 flex flex-col mt-4";

            if (slide.layout === "title-center" || slide.layout === "center-big") {
                body.classList.add("items-center", "justify-center", "text-center", "gap-6");

                const h1 = document.createElement("h1");
                h1.className = slide.layout === "center-big" ? "text-3xl md:text-5xl font-bold tracking-tight" : TITLE_CLASS;
                h1.innerHTML = slide.title || "";
                body.appendChild(h1);

                if (slide.content) {
                    const p = document.createElement("p");
                    p.className = `max-w-3xl ${BODY_TEXT_CLASS}`;
                    p.innerHTML = slide.content;
                    body.appendChild(p);
                }

                if (slide.bullets && slide.bullets.length) {
                    const ul = document.createElement("ul");
                    ul.className = "mt-3 space-y-3 max-w-4xl text-lg md:text-xl text-left";
                    slide.bullets.forEach((b) => {
                        const li = document.createElement("li");
                        li.className = "flex gap-2";
                        li.innerHTML = `<span class="${BULLET_DOT_CLASS}">•</span><span>${b}</span>`;
                        ul.appendChild(li);
                    });
                    body.appendChild(ul);
                }
            } else if (slide.layout === "two-column") {
                body.classList.add("justify-center");
                const grid = document.createElement("div");
                grid.className = "grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 items-start";

                const left = document.createElement("div");
                const lt = document.createElement("h2");
                lt.className = "text-xl 2xl:text-3xl font-semibold mb-3 text-emerald-700";
                lt.innerHTML = slide.leftTitle || "Left";
                left.appendChild(lt);
                const lul = document.createElement("ul");
                lul.className = "space-y-3 text-lg md:text-xl";
                (slide.leftItems || []).forEach((item) => {
                    const li = document.createElement("li");
                    li.className = "flex gap-2";
                    li.innerHTML = `<span class="${BULLET_DOT_CLASS}">•</span><span>${item}</span>`;
                    lul.appendChild(li);
                });
                left.appendChild(lul);

                const right = document.createElement("div");
                const rt = document.createElement("h2");
                rt.className = "text-xl 2xl:text-3xl font-semibold mb-3 text-sky-700";
                rt.innerHTML = slide.rightTitle || "Right";
                right.appendChild(rt);
                const rul = document.createElement("ul");
                rul.className = "space-y-3 text-lg md:text-xl";
                (slide.rightItems || []).forEach((item) => {
                    const li = document.createElement("li");
                    li.className = "flex gap-2";
                    li.innerHTML = `<span class="text-sky-600">•</span><span>${item}</span>`;
                    rul.appendChild(li);
                });
                right.appendChild(rul);

                grid.appendChild(left);
                grid.appendChild(right);
                body.appendChild(grid);
            } else if (slide.layout === "bullets-big" || slide.layout === "title-bullets") {
                // title + bullets layout: comfortable spacing
                const ul = document.createElement("ul");
                ul.className = "space-y-3 text-xl md:text-xl max-w-4xl";
                (slide.bullets || []).forEach((b) => {
                    const li = document.createElement("li");
                    li.className = "flex gap-3";
                    li.innerHTML = `<span class="${BULLET_DOT_CLASS}">•</span><span>${b}</span>`;
                    ul.appendChild(li);
                });
                body.appendChild(ul);
            } else if (slide.layout === "cards-grid") {
                body.classList.add("justify-center");
                const grid = document.createElement("div");
                grid.className = "grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1";

                (slide.cards || []).forEach((card) => {
                    const cardEl = document.createElement("div");
                    cardEl.className = "rounded-xl border border-slate-200 bg-white p-4";

                    const h = document.createElement("div");
                    h.className = "text-base md:text-lg 2xl:text-xl font-semibold text-slate-900";
                    h.innerHTML = card.title || "Card";
                    cardEl.appendChild(h);

                    const p = document.createElement("div");
                    p.className = "mt-1 text-sm md:text-base 2xl:text-lg text-slate-600 leading-relaxed";
                    p.innerHTML = card.body || "";
                    cardEl.appendChild(p);

                    grid.appendChild(cardEl);
                });

                body.appendChild(grid);
            } else if (slide.layout === "cards-media") {
                const grid = document.createElement("div");
                grid.className = "grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 items-center";

                const cardsContainer = document.createElement("div");
                cardsContainer.className = "grid grid-cols-1 sm:grid-cols-2 gap-3";

                (slide.cards || []).forEach((card) => {
                    const cardEl = document.createElement("div");
                    cardEl.className = "rounded-xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow";

                    const h = document.createElement("div");
                    h.className = "text-sm md:text-base 2xl:text-lg font-semibold text-slate-900 mb-1";
                    h.innerHTML = card.title || "Card";
                    cardEl.appendChild(h);

                    const p = document.createElement("div");
                    p.className = "text-xs md:text-sm 2xl:text-base text-slate-600 leading-relaxed";
                    p.innerHTML = card.body || "";
                    cardEl.appendChild(p);

                    cardsContainer.appendChild(cardEl);
                });

                const mediaContainer = document.createElement("div");
                mediaContainer.className = "h-full p-4 min-h-0 flex items-center justify-center";
                if ((slide.mediaType || "image") === "video") {
                    const video = document.createElement("video");
                    video.src = slide.mediaUrl || "";
                    video.controls = true;
                    video.className = "w-full h-auto rounded-lg shadow-lg";
                    mediaContainer.appendChild(video);
                } else {
                    const img = document.createElement("img");
                    img.src = slide.mediaUrl || slide.imageUrl || "";
                    img.alt = stripHtml(slide.imageAlt || "");
                    img.className = "w-full h-full max-h-full object-cover rounded-lg shadow-lg";
                    mediaContainer.appendChild(img);
                }

                grid.appendChild(cardsContainer);
                grid.appendChild(mediaContainer);
                body.appendChild(grid);
            } else if (slide.layout === "image-full") {
                body.classList.add("items-center", "justify-center");
                const img = document.createElement("img");
                img.src = slide.imageUrl || "";
                img.alt = stripHtml(slide.imageAlt || "");
                img.loading = "lazy";
                img.className = "max-h-full max-w-full object-contain";
                body.appendChild(img);
            } else if (slide.layout === "image-caption") {
                const figure = document.createElement("figure");
                figure.className = "flex-1 min-h-0 flex flex-col";

                const mediaWrap = document.createElement("div");
                mediaWrap.className = "flex-1 min-h-0 overflow-hidden";

                const img = document.createElement("img");
                img.src = slide.imageUrl || "";
                img.alt = stripHtml(slide.imageAlt || "");
                img.loading = "lazy";
                img.className = "w-full h-full object-contain";
                mediaWrap.appendChild(img);
                figure.appendChild(mediaWrap);

                if (slide.caption) {
                    const cap = document.createElement("figcaption");
                    cap.className = "mt-3 text-sm md:text-base text-slate-600 shrink-0";
                    cap.innerHTML = slide.caption;
                    figure.appendChild(cap);
                }
                body.appendChild(figure);
            } else if (slide.layout === "media-left" || slide.layout === "media-right") {
                const grid = document.createElement("div");
                grid.className = "grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 items-center";

                function makeMedia() {
                    const container = document.createElement("div");
                    container.className = "h-full p-2 min-h-0 flex items-center";
                    if ((slide.mediaType || "image") === "video") {
                        const video = document.createElement("video");
                        video.src = slide.mediaUrl || "";
                        video.controls = true;
                        video.className = "w-full h-auto";
                        container.appendChild(video);
                    } else {
                        const img = document.createElement("img");
                        img.src = slide.mediaUrl || slide.imageUrl || "";
                        img.alt = stripHtml(slide.imageAlt || "");
                        img.className = "w-full h-full max-h-full object-contain";
                        container.appendChild(img);
                    }
                    return container;
                }

                function makeText() {
                    const container = document.createElement("div");
                    if (slide.content) {
                        const p = document.createElement("p");
                        p.className = `${BODY_TEXT_CLASS} mb-3`;
                        p.innerHTML = slide.content;
                        container.appendChild(p);
                    }
                    if (slide.bullets && slide.bullets.length) {
                        const ul = document.createElement("ul");
                        ul.className = "space-y-3 text-base 2xl:text-xl";
                        slide.bullets.forEach((b) => {
                            const li = document.createElement("li");
                            li.className = "flex gap-2";
                            li.innerHTML = `<span class="${BULLET_DOT_CLASS}">•</span><span>${b}</span>`;
                            ul.appendChild(li);
                        });
                        container.appendChild(ul);
                    }
                    return container;
                }

                const media = makeMedia();
                const text = makeText();

                if (slide.layout === "media-left") {
                    grid.appendChild(media);
                    grid.appendChild(text);
                } else {
                    grid.appendChild(text);
                    grid.appendChild(media);
                }
                body.appendChild(grid);
            } else if (slide.layout === "code") {
                const pre = document.createElement("pre");
                pre.className = "text-sm md:text-base bg-slate-50 border border-slate-200 rounded p-4 overflow-auto";
                const code = document.createElement("code");
                code.textContent = slide.code || "";
                pre.appendChild(code);
                body.appendChild(pre);
                if (slide.caption) {
                    const cap = document.createElement("p");
                    cap.className = "mt-3 text-sm md:text-base text-slate-600";
                    cap.innerHTML = slide.caption;
                    body.appendChild(cap);
                }
            } else if (slide.layout === "quote") {
                body.classList.add("items-center", "justify-center", "text-center", "gap-4");
                const q = document.createElement("blockquote");
                q.className = "text-2xl md:text-3xl font-medium text-slate-900";
                q.innerHTML = slide.quote || slide.content || "";
                body.appendChild(q);
                if (slide.author) {
                    const a = document.createElement("div");
                    a.className = "text-slate-600 text-sm md:text-base";
                    a.innerHTML = `— ${slide.author}`;
                    body.appendChild(a);
                }
            } else {
                if (slide.content) {
                    const p = document.createElement("p");
                    p.className = BODY_TEXT_CLASS;
                    p.innerHTML = slide.content;
                    body.appendChild(p);
                }
            }

            inner.appendChild(body);

            // Optional bottom reference link/text
            const refFooter = makeReferenceFooter(slide);
            if (refFooter) inner.appendChild(refFooter);

            wrapper.appendChild(inner);
            return wrapper;
        }

        function renderSlides() {
            slidesContainer.innerHTML = "";
            slides.forEach((s, idx) => {
                const el = createSlideElement(s, idx);
                if (idx === currentIndex) el.classList.add("active");
                slidesContainer.appendChild(el);
            });
        }

        function renderPresenterBits() {
            const shouldShowControls = isPresenterWindow;

            document.documentElement.dataset.webdeckRole = isPresenterWindow ? "presenter" : "viewer";

            controlBar.classList.remove("hidden");
            footerBar.classList.remove("hidden");
            presenterPanel.classList.remove("hidden");

            if (shouldShowControls) {
                controlBar.classList.remove("webdeck-hidden");
                footerBar.classList.remove("webdeck-hidden");
                viewerPresenterBtn.classList.add("webdeck-hidden");
            } else {
                controlBar.classList.add("webdeck-hidden");
                footerBar.classList.add("webdeck-hidden");
                viewerPresenterBtn.classList.remove("webdeck-hidden");
            }
            viewerPresenterBtn.textContent = "Open Presenter Window";

            if (isPresenterWindow && window.innerWidth >= 1024) {
                presenterPanel.classList.remove("webdeck-hidden");
                presenterPanel.classList.add("flex");
            } else {
                presenterPanel.classList.add("webdeck-hidden");
                presenterPanel.classList.remove("flex");
            }

            roleLabelEl.textContent = isPresenterWindow ? "Presenter Mode" : "Viewer Mode";
            roleLabelEl.className = isPresenterWindow
                ? "text-xs px-2 py-1 rounded-full border border-sky-400/60 text-sky-700 bg-sky-500/10"
                : "text-xs px-2 py-1 rounded-full border border-emerald-500/40 text-emerald-700 bg-emerald-500/10";

            togglePresenterBtn.textContent = isPresenterWindow ? "Use as Viewer Only" : "Open Presenter Window";

            if (!isPresenterWindow) return;

            const currentSlide = slides[currentIndex];
            const nextSlide = slides[currentIndex + 1];

            function makePreviewContent(slide) {
                if (!slide) return "";
                const container = document.createElement("div");
                container.className = "w-full h-full p-4 text-[11px] text-slate-900 flex flex-col";

                const title = document.createElement("div");
                title.className = "font-semibold 2xl:text-2xl text-xs mb-1 line-clamp-2";
                title.textContent = slide.title || "(Untitled)";
                container.appendChild(title);

                if (slide.bullets && slide.bullets.length) {
                    const ul = document.createElement("ul");
                    ul.className = "space-y-0.5 text-[11px] text-slate-600";
                    slide.bullets.slice(0, 4).forEach((b) => {
                        const li = document.createElement("li");
                        li.className = "flex gap-1";
                        li.innerHTML = `<span class="mt-0.5">•</span><span class="line-clamp-1">${b}</span>`;
                        ul.appendChild(li);
                    });
                    container.appendChild(ul);
                } else if (slide.content) {
                    const p = document.createElement("p");
                    p.className = "text-[11px] text-slate-600 line-clamp-4 whitespace-pre-line";
                    p.textContent = slide.content;
                    container.appendChild(p);
                } else if (slide.cards && slide.cards.length) {
                    const p = document.createElement("p");
                    p.className = "text-[11px] text-slate-600 line-clamp-4";
                    p.textContent = slide.cards.map((c) => c.title).slice(0, 4).join(" • ");
                    container.appendChild(p);
                } else if (slide.imageUrl || slide.mediaUrl) {
                    const p = document.createElement("p");
                    p.className = "text-[11px] text-slate-600";
                    const label = slide.mediaType === "video" ? "Video" : "Image";
                    p.textContent = `${label}${slide.imageAlt ? `: ${slide.imageAlt}` : ""}`;
                    container.appendChild(p);
                } else if (slide.code) {
                    const p = document.createElement("p");
                    p.className = "text-[11px] text-slate-600 line-clamp-3";
                    p.textContent = (slide.code || "").split("\n").slice(0, 3).join(" ");
                    container.appendChild(p);
                } else if (slide.quote) {
                    const p = document.createElement("p");
                    p.className = "text-[11px] text-slate-600 line-clamp-2";
                    p.textContent = slide.quote;
                    container.appendChild(p);
                }

                return container;
            }

            nextPreview.innerHTML = "";

            if (nextSlide) {
                nextPreview.classList.remove("text-slate-500");
                nextPreview.appendChild(makePreviewContent(nextSlide));
            } else {
                nextPreview.textContent = "End of deck";
            }

            notesContainer.innerHTML = "";
            const notesWrapper = document.createElement("div");
            notesWrapper.className = "notes bg-white border border-slate-200 rounded p-3 text-sm text-slate-900";

            const title = document.createElement("div");
            title.className = "text-xs uppercase tracking-wide text-slate-400 mb-1";
            title.textContent = `Notes for slide ${currentIndex + 1}`;
            notesWrapper.appendChild(title);

            const pre = document.createElement("pre");
            pre.className = "text-sm text-slate-900";
            pre.textContent = currentSlide.notes || "(No speaker notes for this slide.)";
            notesWrapper.appendChild(pre);

            notesContainer.appendChild(notesWrapper);
        }

        function render() {
            const slideEls = slidesContainer.querySelectorAll(".slide");
            if (!slideEls.length) {
                renderSlides();
            } else {
                slideEls.forEach((el, idx) => {
                    el.classList.toggle("active", idx === currentIndex);
                });
            }

            slideNumberEl.textContent = String(currentIndex + 1);
            renderPresenterBits();
        }

        function goTo(index, { broadcast = true } = {}) {
            const clamped = Math.max(0, Math.min(slides.length - 1, index));
            if (clamped === currentIndex) return;
            currentIndex = clamped;
            render();
            if (broadcast) broadcastState(currentIndex);
        }

        function nextSlide(opts) {
            goTo(currentIndex + 1, opts);
        }

        function prevSlide(opts) {
            goTo(currentIndex - 1, opts);
        }

        function exportPdfViaPrint() {
            window.print();
        }

        document.addEventListener("keydown", (e) => {
            if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
            if (e.defaultPrevented) return;

            switch (e.key) {
                case "ArrowRight":
                case "ArrowDown":
                case " ":
                    e.preventDefault();
                    nextSlide();
                    break;
                case "ArrowLeft":
                case "ArrowUp":
                    e.preventDefault();
                    prevSlide();
                    break;
                case "p":
                case "P":
                    e.preventDefault();
                    togglePresenterWindow();
                    break;
                case "e":
                case "E":
                    e.preventDefault();
                    exportPdfViaPrint();
                    break;
                case "n":
                case "N":
                    if (window.innerWidth >= 1024) {
                        e.preventDefault();
                        isPresenterWindow = !isPresenterWindow;
                        localStorage.setItem(ROLE_KEY, isPresenterWindow ? "presenter" : "viewer");
                        renderPresenterBits();
                    }
                    break;
            }
        });

        function togglePresenterWindow() {
            if (isPresenterWindow) {
                isPresenterWindow = false;
                localStorage.setItem(ROLE_KEY, "viewer");
                presenterWindowRef && presenterWindowRef.close();
                presenterWindowRef = null;
                renderPresenterBits();
                history.replaceState({}, "", window.location.pathname + "?role=viewer");
                return;
            }

            const url = new URL(window.location.href);
            url.searchParams.set("role", "presenter");
            presenterWindowRef = window.open(url.toString(), "webdeck_presenter", "width=1100,height=800");
            if (!presenterWindowRef) {
                alert(
                    "Popup blocked. Please allow popups for this site or open another window manually with ?role=presenter."
                );
                return;
            }

            isPresenterWindow = false;
            localStorage.setItem(ROLE_KEY, "viewer");
            history.replaceState({}, "", window.location.pathname + "?role=viewer");
            renderPresenterBits();
        }

        togglePresenterBtn.addEventListener("click", () => {
            togglePresenterWindow();
        });

        viewerPresenterBtn.addEventListener("click", () => {
            togglePresenterWindow();
        });

        printBtn.addEventListener("click", () => {
            exportPdfViaPrint();
        });

        if (isPresenterWindow) {
            const url = new URL(window.location.href);
            url.searchParams.set("role", "presenter");
            history.replaceState({}, "", url.toString());
        } else {
            const url = new URL(window.location.href);
            url.searchParams.set("role", "viewer");
            history.replaceState({}, "", url.toString());
        }

        const timeDisplay = document.getElementById("timeDisplay");
        const timerToggle = document.getElementById("timerToggle");

        let timerInterval = null;
        let timerStart = null;

        function updateTimer() {
            if (!timerStart) return;
            const elapsedMs = Date.now() - timerStart;
            const totalSeconds = Math.floor(elapsedMs / 1000);
            const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
            const seconds = String(totalSeconds % 60).padStart(2, "0");
            timeDisplay.textContent = `${minutes}:${seconds}`;
        }

        function startTimer() {
            timerStart = Date.now();
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(updateTimer, 1000);
            timerToggle.textContent = "Stop";
        }

        function stopTimer() {
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = null;
            timerStart = null;
            timeDisplay.textContent = "00:00";
            timerToggle.textContent = "Start";
        }

        timerToggle.addEventListener("click", () => {
            if (timerInterval) {
                stopTimer();
            } else {
                startTimer();
            }
        });

        const storedIndex = parseInt(localStorage.getItem(SLIDE_STATE_KEY) || "0", 10);
        if (!isNaN(storedIndex) && storedIndex >= 0 && storedIndex < slides.length) {
            currentIndex = storedIndex;
        }

        renderSlides();
        render();

        window.addEventListener("resize", () => {
            renderPresenterBits();
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        init().catch((e) => console.error("Deck init failed:", e));
    });
})();
