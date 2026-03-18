const projectAccentCycle = ["blue", "clay"];
const mobileProjectMedia = window.matchMedia("(max-width: 760px)");

const fallbackHeadlines = [
  "Asheville morning updates and regional weather coverage.",
  "Blue Ridge stories rotating in from local and state outlets.",
  "Local events and city headlines arriving as the feed refreshes.",
];

const fallbackWeather = {
  temp: 61,
  apparent: 59,
  condition: "Mist",
  summary: "61\u00B0 \u00B7 Mist",
};

const parkwayTargets = [
  {
    key: "381.9 - 382.8",
    label: "381.9 - 382.8",
    crossroads: "Folk Art Center to Highway 70 (Tunnel Road)",
    status: "Ungated",
    notes: "Open except in emergency situations.",
  },
  {
    key: "382.8 - 384.1",
    label: "382.8 - 384.1",
    crossroads: "Highway 70 (Tunnel Road) to Park Headquarters and Visitor Center",
    status: "Open",
    notes: "No additional notes listed.",
  },
  {
    key: "384.1 - 384.7",
    label: "384.1 - 384.7",
    crossroads: "Park Headquarters and Visitor Center to Highway 74 (I-40 Exit 53A)",
    status: "Ungated",
    notes: "Open except in emergency situations.",
  },
  {
    key: "384.7 - 388.8",
    label: "384.7 - 388.8",
    crossroads: "Highway 74 (I-40 Exit 53A) to Highway 25 (Hendersonville Road)",
    status: "Open",
    notes: "No additional notes listed.",
  },
  {
    key: "388.8 - 393.6",
    label: "388.8 - 393.6",
    crossroads: "Highway 25 (Hendersonville Road) to NC Route 191 (Brevard Road)",
    status: "Open",
    notes:
      "The contractor may implement short duration single-lane, daytime traffic control for the duration of the bridge work project over I-26.",
  },
];

const state = {
  activeProjectId: null,
  projects: [],
  projectConfigState: "loading",
  weather: fallbackWeather,
  headlines: fallbackHeadlines,
  parkwayEntries: parkwayTargets,
  parkwayOverallStatus: "Open",
  rotationIndex: 0,
  rotationTimer: null,
  stripOpen: false,
  panelTouchStartY: null,
};

const dom = {
  body: document.body,
  projectGrid: document.querySelector("#project-grid"),
  weatherTemp: document.querySelector("[data-weather-temp]"),
  weatherCondition: document.querySelector("[data-weather-condition]"),
  themeName: document.querySelector("[data-theme-name]"),
  stripLabel: document.querySelector("[data-strip-label]"),
  stripText: document.querySelector("[data-strip-text]"),
  detailWeather: document.querySelector("[data-detail-weather]"),
  detailFeels: document.querySelector("[data-detail-feels]"),
  headlineList: document.querySelector("[data-headline-list]"),
  atmosphereCopy: document.querySelector("[data-atmosphere-copy]"),
  stripToggle: document.querySelector("#asheville-toggle"),
  stripPanel: document.querySelector("#asheville-panel"),
  stripClose: document.querySelector("#asheville-close"),
  stripCue: document.querySelector(".asheville-strip__cue"),
  parkwaySummary: document.querySelector("[data-parkway-summary]"),
  parkwayLink: document.querySelector("[data-parkway-link]"),
  heroBackdrop: document.querySelector(".hero__backdrop"),
};

const weatherCodeMap = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

function init() {
  syncTheme();
  renderProjects();
  renderParkwaySummary();
  updateAmbientCopy();
  setupProjectInteractions();
  setupStripInteractions();
  setupParallax();
  setupResponsiveProjectFiltering();
  loadProjectConfig();
  loadAshevilleData();
  loadBlueRidgeStatus();
  window.setInterval(syncTheme, 60000);
  window.addEventListener("resize", syncExpandedProjectHeight);
}

function renderProjects() {
  const visibleProjects = getVisibleProjects();

  if (state.projectConfigState === "loading") {
    dom.projectGrid.innerHTML =
      '<p class="project-grid__message">Loading released projects from siteconfig.xml.</p>';
    dom.projectGrid.classList.remove("has-expanded");
    return;
  }

  if (!visibleProjects.length) {
    const message =
      state.projectConfigState === "error"
        ? "Released projects could not be loaded from siteconfig.xml."
        : mobileProjectMedia.matches
          ? "No released projects in siteconfig.xml are marked for smaller screens."
          : "No released projects were found in siteconfig.xml.";
    dom.projectGrid.innerHTML = `<p class="project-grid__message">${message}</p>`;
    dom.projectGrid.classList.remove("has-expanded");
    return;
  }

  dom.projectGrid.innerHTML = visibleProjects.map(projectTemplate).join("");
  syncExpandedProjectHeight();
}

function projectTemplate(project) {
  return `
    <article class="project-card" data-project-id="${project.id}" data-accent="${project.accent}">
      <div class="project-card__ambient" aria-hidden="true"></div>
      <button class="project-card__summary" type="button" aria-expanded="false">
        <div class="project-card__thumb-wrap">
          <img
            class="project-card__thumb"
            src="${escapeAttribute(project.thumbnail)}"
            alt="${escapeAttribute(project.title)} thumbnail"
            loading="lazy"
          />
        </div>
        <div class="project-card__meta">
          <span class="project-card__tag">${project.okForMobile ? "Mobile-ready" : "Desktop-first"}</span>
          <span class="project-card__hint">Tap to expand</span>
        </div>
        <div>
          <h3 class="project-card__title">${escapeHtml(project.title)}</h3>
          <p class="project-card__description">${escapeHtml(project.description)}</p>
        </div>
      </button>
      <div class="project-card__detail-wrap" aria-hidden="true" inert>
        <div class="project-card__detail-inner">
          <div class="project-card__detail-head">
            <h3>${escapeHtml(project.title)}</h3>
            <button class="icon-button" type="button" data-close-project>Close</button>
          </div>
          <div class="project-card__detail-layout">
            <div class="preview preview--image">
              <img
                class="project-card__detail-image"
                src="${escapeAttribute(project.thumbnail)}"
                alt="${escapeAttribute(project.title)} preview"
                loading="lazy"
              />
            </div>
            <div class="project-card__detail-copy-block">
              <p class="project-card__detail-copy">${escapeHtml(project.description)}</p>
              <div class="project-card__actions">
                <a class="button-link" href="${escapeAttribute(project.href)}">Open project</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderParkwaySummary() {
  dom.parkwaySummary.textContent = `Blue Ridge Parkway Status: ${state.parkwayOverallStatus}`;
  dom.parkwayLink.href = buildParkwayLink();
}

async function loadProjectConfig() {
  try {
    const response = await fetch("siteconfig.xml", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Project config request failed");
    }

    const xmlText = await response.text();
    state.projects = parseProjectConfig(xmlText);
    state.projectConfigState = "ready";
  } catch (error) {
    state.projects = [];
    state.projectConfigState = "error";
  }

  if (
    state.activeProjectId &&
    !getVisibleProjects().some((project) => project.id === state.activeProjectId)
  ) {
    state.activeProjectId = null;
  }

  renderProjects();
}

function parseProjectConfig(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  return Array.from(xml.querySelectorAll("project")).map((node, index) => {
    const id = node.getAttribute("id") || `project-${index + 1}`;
    return {
      id,
      title: getXmlText(node, "labelTxt") || id,
      description: getXmlText(node, "Description") || "No description provided.",
      href: normalizeSitePath(getXmlText(node, "url") || "#"),
      thumbnail: normalizeSitePath(getXmlText(node, "thumbnailImage") || ""),
      okForMobile: /^yes$/i.test(getXmlText(node, "okforMobile") || ""),
      accent: projectAccentCycle[index % projectAccentCycle.length],
    };
  });
}

function getVisibleProjects() {
  if (!mobileProjectMedia.matches) {
    return state.projects;
  }

  return state.projects.filter((project) => project.okForMobile);
}

function setupResponsiveProjectFiltering() {
  const handleChange = () => {
    if (
      state.activeProjectId &&
      !getVisibleProjects().some((project) => project.id === state.activeProjectId)
    ) {
      state.activeProjectId = null;
    }

    renderProjects();
  };

  if (typeof mobileProjectMedia.addEventListener === "function") {
    mobileProjectMedia.addEventListener("change", handleChange);
    return;
  }

  mobileProjectMedia.addListener(handleChange);
}

function getXmlText(node, tagName) {
  const child = node.querySelector(tagName);
  return child ? child.textContent.trim() : "";
}

function normalizeSitePath(value) {
  return value.replace(/\\/g, "/");
}

function setupProjectInteractions() {
  dom.projectGrid.addEventListener("click", (event) => {
    const summaryButton = event.target.closest(".project-card__summary");
    const closeButton = event.target.closest("[data-close-project]");

    if (closeButton) {
      collapseProjects();
      return;
    }

    if (!summaryButton) {
      return;
    }

    const card = summaryButton.closest(".project-card");
    const nextId =
      state.activeProjectId === card.dataset.projectId
        ? null
        : card.dataset.projectId;

    setActiveProject(nextId);
  });

  const finePointer = window.matchMedia("(pointer: fine)");
  if (finePointer.matches) {
    dom.projectGrid.addEventListener("pointermove", handleCardTilt);
    dom.projectGrid.addEventListener("pointerleave", resetCardTilt, true);
  }

  document.addEventListener("pointerdown", (event) => {
    if (
      state.activeProjectId &&
      !event.target.closest(".project-card.is-expanded")
    ) {
      collapseProjects();
    }

    if (state.stripOpen && !event.target.closest(".asheville-strip")) {
      setStripOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (state.activeProjectId) {
      collapseProjects();
    }

    if (state.stripOpen) {
      setStripOpen(false);
    }
  });
}

function setupStripInteractions() {
  dom.stripToggle.addEventListener("click", () => {
    setStripOpen(!state.stripOpen);
  });

  dom.stripClose.addEventListener("click", () => setStripOpen(false));

  dom.stripPanel.addEventListener("touchstart", (event) => {
    state.panelTouchStartY = event.changedTouches[0].clientY;
  });

  dom.stripPanel.addEventListener("touchend", (event) => {
    if (state.panelTouchStartY === null) {
      return;
    }

    const deltaY = event.changedTouches[0].clientY - state.panelTouchStartY;
    if (deltaY > 60) {
      setStripOpen(false);
    }

    state.panelTouchStartY = null;
  });
}

function handleCardTilt(event) {
  const card = event.target.closest(".project-card");
  if (!card || card.classList.contains("is-expanded")) {
    return;
  }

  const bounds = card.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  const rotateY = (x - 0.5) * 10;
  const rotateX = (0.5 - y) * 10;
  card.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
}

function resetCardTilt(event) {
  const card = event.target.closest(".project-card");
  if (!card || card.classList.contains("is-expanded")) {
    return;
  }

  card.style.transform = "";
}

function setActiveProject(projectId) {
  state.activeProjectId = projectId;
  dom.projectGrid.classList.toggle("has-expanded", Boolean(projectId));

  dom.projectGrid.querySelectorAll(".project-card").forEach((card) => {
    const expanded = card.dataset.projectId === projectId;
    const summary = card.querySelector(".project-card__summary");
    const detailWrap = card.querySelector(".project-card__detail-wrap");
    const detailInner = card.querySelector(".project-card__detail-inner");

    card.classList.toggle("is-expanded", expanded);
    summary.setAttribute("aria-expanded", String(expanded));
    detailWrap.setAttribute("aria-hidden", String(!expanded));
    detailWrap.inert = !expanded;

    if (expanded) {
      detailWrap.style.maxHeight = `${detailInner.scrollHeight}px`;
      card.style.transform = "";
      card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      detailWrap.style.maxHeight = "0px";
    }
  });
}

function collapseProjects() {
  setActiveProject(null);
}

function syncExpandedProjectHeight() {
  if (!state.activeProjectId) {
    return;
  }

  const card = dom.projectGrid.querySelector(
    `[data-project-id="${state.activeProjectId}"]`
  );

  if (!card) {
    return;
  }

  const detailWrap = card.querySelector(".project-card__detail-wrap");
  const detailInner = card.querySelector(".project-card__detail-inner");
  detailWrap.style.maxHeight = `${detailInner.scrollHeight}px`;
}

function setStripOpen(isOpen) {
  state.stripOpen = isOpen;
  const inner = dom.stripPanel.querySelector(".asheville-strip__panel-inner");
  dom.stripToggle.setAttribute("aria-expanded", String(isOpen));
  dom.stripPanel.setAttribute("aria-hidden", String(!isOpen));
  dom.stripPanel.inert = !isOpen;
  dom.stripPanel.classList.toggle("is-open", isOpen);
  dom.stripPanel.style.maxHeight = isOpen ? `${inner.scrollHeight}px` : "0px";
  dom.stripCue.textContent = isOpen ? "Close" : "Open";
}

function syncTheme() {
  const hour = new Date().getHours();
  let theme = "night";

  if (hour >= 6 && hour < 11) {
    theme = "morning";
  } else if (hour >= 11 && hour < 18) {
    theme = "day";
  } else if (hour >= 18 && hour < 21) {
    theme = "evening";
  }

  document.documentElement.dataset.theme = theme;
  dom.body.dataset.theme = theme;
  dom.themeName.textContent = `${capitalize(theme)} mode`;
  updateAmbientCopy();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function updateAmbientCopy() {
  const theme = dom.body.dataset.theme || "day";
  const atmosphere = buildAtmosphere(theme, state.weather);
  const rotationItems = [
    { label: "Weather", text: state.weather.summary },
    { label: "Headline", text: state.headlines[0] || fallbackHeadlines[0] },
    { label: "Atmosphere", text: atmosphere },
  ];

  const activeItem = rotationItems[state.rotationIndex % rotationItems.length];
  dom.stripLabel.textContent = activeItem.label;
  dom.stripText.textContent = activeItem.text;
  dom.atmosphereCopy.textContent = atmosphere;
  dom.detailWeather.textContent = state.weather.summary;
  dom.detailFeels.textContent = `Feels like ${state.weather.apparent}\u00B0 in Asheville right now.`;
  dom.weatherTemp.textContent = `${state.weather.temp}\u00B0`;
  dom.weatherCondition.textContent = state.weather.condition;
  dom.headlineList.innerHTML = state.headlines
    .slice(0, 3)
    .map((headline) => `<li>${headline}</li>`)
    .join("");

  if (state.stripOpen) {
    setStripOpen(true);
  }
}

function buildAtmosphere(theme, weather) {
  const lowerCondition = weather.condition.toLowerCase();

  if (lowerCondition.includes("rain")) {
    return "Rain holding close to the Blue Ridge while the page keeps its gestures quiet.";
  }

  if (lowerCondition.includes("fog") || lowerCondition.includes("mist")) {
    return "Fog settling over the Blue Ridge and softening the edges of the interface.";
  }

  if (theme === "morning") {
    return "Morning light warming the ridgeline and easing the site into view.";
  }

  if (theme === "evening") {
    return "Clay light across Asheville, slower highlights, and a little more glow on touch.";
  }

  if (theme === "night") {
    return "Cool blue highlights, longer loops, and a quieter surface after dark.";
  }

  return "Clearer daylight over Asheville with enough space for the projects to stay the focus.";
}

async function loadBlueRidgeStatus() {
  try {
    const html = await fetchBlueRidgeClosuresHtml();
    const parsed = parseBlueRidgeClosures(html);
    state.parkwayEntries = parsed.entries;
  } catch (error) {
    state.parkwayEntries = parkwayTargets;
  }

  state.parkwayOverallStatus = getOverallParkwayStatus(state.parkwayEntries);
  renderParkwaySummary();
}

async function loadAshevilleData() {
  const [weatherResult, headlinesResult] = await Promise.allSettled([
    fetchWeather(),
    fetchHeadlines(),
  ]);

  if (weatherResult.status === "fulfilled") {
    state.weather = weatherResult.value;
  }

  if (headlinesResult.status === "fulfilled" && headlinesResult.value.length) {
    state.headlines = headlinesResult.value;
  }

  updateAmbientCopy();
  startStripRotation();
}

async function fetchWeather() {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=35.5951&longitude=-82.5515&current=temperature_2m,apparent_temperature,weather_code&temperature_unit=fahrenheit&timezone=auto";
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Weather request failed");
  }

  const payload = await response.json();
  const current = payload.current;
  const temp = Math.round(current.temperature_2m);
  const apparent = Math.round(current.apparent_temperature);
  const condition = weatherCodeMap[current.weather_code] || "Calm";

  return {
    temp,
    apparent,
    condition,
    summary: `${temp}\u00B0 \u00B7 ${condition}`,
  };
}

async function fetchHeadlines() {
  const feedUrl =
    "https://news.google.com/rss/search?q=Asheville%20NC&hl=en-US&gl=US&ceid=US:en";
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(feedUrl)}`;
  const response = await fetch(proxyUrl);

  if (!response.ok) {
    throw new Error("Headline request failed");
  }

  const payload = await response.json();
  const xml = new DOMParser().parseFromString(payload.contents, "text/xml");
  const items = Array.from(xml.querySelectorAll("item title"))
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .map((title) => title.replace(/\s*-\s*Google News\s*$/, ""));

  return items.slice(0, 5);
}

async function fetchBlueRidgeClosuresHtml() {
  const roadStatusUrl = "https://www.nps.gov/blri/planyourvisit/roadclosures.htm";
  const requests = [
    roadStatusUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(roadStatusUrl)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(roadStatusUrl)}`,
  ];

  for (const url of requests) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      if (url.includes("/get?url=")) {
        const payload = await response.json();
        if (payload.contents) {
          return payload.contents;
        }
        continue;
      }

      const text = await response.text();
      if (text) {
        return text;
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error("Unable to load Blue Ridge Parkway road closures.");
}

function parseBlueRidgeClosures(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fullText = normalizeWhitespace(doc.body ? doc.body.textContent : html);
  const northCarolinaText = extractNorthCarolinaSection(fullText);
  const updatedMatch = fullText.match(
    /Road status as of\s+(.+?)\.\s+Status is subject to change/i
  );

  const entries = parkwayTargets.map((target, index) => {
    const nextTarget = parkwayTargets[index + 1];
    const row = extractParkwayRow(northCarolinaText, target, nextTarget);
    return row || target;
  });

  return {
    entries,
  };
}

function extractNorthCarolinaSection(text) {
  const startMarker = "North Carolina Sections of Parkway";
  const endMarker = "*Note: Sections of the roadway marked as";
  const startIndex = text.indexOf(startMarker);
  const endIndex = text.indexOf(endMarker);

  if (startIndex === -1) {
    return text;
  }

  if (endIndex === -1 || endIndex <= startIndex) {
    return text.slice(startIndex);
  }

  return text.slice(startIndex, endIndex);
}

function extractParkwayRow(text, target, nextTarget) {
  const statusPattern =
    "(Open|Closed Until Further Notice|Partial Closure|Closed|Ungated\\*?|Ungated)";
  const segmentPattern = target.key === "388.8 - 393.6" ? "388\\.8\\s*-\\s*393(?:\\.6)?" : escapeRegex(target.key).replace(/\s+/g, "\\s*");
  const nextPattern = nextTarget
    ? nextTarget.key === "388.8 - 393.6"
      ? "388\\.8\\s*-\\s*393(?:\\.6)?"
      : escapeRegex(nextTarget.key).replace(/\s+/g, "\\s*")
    : "393\\.6\\s*-\\s*402\\.7|\\*Note:";

  const rowPattern = new RegExp(
    `${segmentPattern}\\s+(.+?)\\s+${statusPattern}\\s*(.*?)(?=${nextPattern})`,
    "i"
  );
  const match = text.match(rowPattern);

  if (!match) {
    return null;
  }

  const normalizedStatus = normalizeWhitespace(match[2]).replace(/\*$/, "");
  const rawNotes = normalizeWhitespace(match[3]);
  let notes = rawNotes;
  if (!notes) {
    notes = normalizedStatus.toLowerCase().startsWith("ungated")
      ? "Open except in emergency situations."
      : "No additional notes listed.";
  }

  return {
    key: target.key,
    label: target.label,
    crossroads: normalizeWhitespace(match[1]),
    status: normalizedStatus,
    notes,
  };
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function getOverallParkwayStatus(entries) {
  const hasClosed = entries.some((entry) => {
    const normalized = entry.status.toLowerCase();
    return normalized.includes("closed") || normalized.includes("partial");
  });

  return hasClosed ? "Closed" : "Open";
}

function buildParkwayLink() {
  return "https://www.nps.gov/blri/planyourvisit/roadclosures.htm#:~:text=381.9%20-%20382.8,388.8%20-%20393.6";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function startStripRotation() {
  if (state.rotationTimer) {
    window.clearInterval(state.rotationTimer);
  }

  state.rotationTimer = window.setInterval(() => {
    state.rotationIndex += 1;
    updateAmbientCopy();
  }, 8000);
}

function setupParallax() {
  let ticking = false;

  const update = () => {
    const offset = window.scrollY * 0.08;
    dom.heroBackdrop.style.transform = `translateY(${offset.toFixed(2)}px)`;
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(update);
  });
}

init();
