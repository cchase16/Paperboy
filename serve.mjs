import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const rootDir = resolve(process.cwd());
const requestHeaders = {
  "user-agent": "quiet-playground-site/1.0",
};
const parkwaySourceUrl = "https://www.nps.gov/blri/planyourvisit/roadclosures.htm";
const ashevilleParkwaySections = new Set([
  "381.9 - 382.8",
  "382.8 - 384.1",
  "384.1 - 384.7",
  "384.7 - 388.8",
  "388.8 - 393.6",
]);
const closedSectionLink =
  "https://www.nps.gov/blri/planyourvisit/roadclosures.htm#:~:text=381.9%20-%20382.8";
const venueConfigs = [
  {
    id: "asheville-yards",
    label: "Asheville Yards",
    sourceUrl: "https://www.ashevilleyards.com/calendar/?ical=1",
    parser: parseIcalVenueEvents,
  },
  {
    id: "orange-peel",
    label: "The Orange Peel",
    sourceUrl: "https://theorangepeel.net/events/",
    parser: parseRhpVenueEvents,
  },
  {
    id: "grey-eagle",
    label: "The Grey Eagle",
    sourceUrl: "https://www.thegreyeagle.com/",
    parser: parseRhpVenueEvents,
  },
  {
    id: "harrahs-cherokee-center",
    label: "Harrah's Cherokee Center",
    sourceUrl: "https://www.harrahscherokeecenterasheville.com/events",
    parser: parseHarrahsVenueEvents,
  },
  {
    id: "asheville-music-hall",
    label: "Asheville Music Hall",
    sourceUrl: "https://ashevillemusichall.com/",
    parser: parseRhpVenueEvents,
  },
  {
    id: "revival-asheville",
    label: "Revival Asheville",
    sourceUrl: "https://www.revivalavl.com/calendar",
    parser: parseRevivalVenueEvents,
  },
];
const venueConfigMap = new Map(venueConfigs.map((config) => [config.id, config]));
const portArgIndex = process.argv.indexOf("--port");
const port =
  Number.parseInt(process.env.PORT || process.argv[portArgIndex + 1] || "8080", 10) ||
  8080;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".wav": "audio/wav",
};

function safePathFromUrl(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const cleaned = decoded === "/" ? "/index.html" : decoded;
  const normalizedPath = normalize(cleaned).replace(/^([/\\])+/, "");
  const absolutePath = resolve(join(rootDir, normalizedPath));

  if (!absolutePath.startsWith(rootDir)) {
    return null;
  }

  if (existsSync(absolutePath) && statSync(absolutePath).isDirectory()) {
    return join(absolutePath, "index.html");
  }

  return absolutePath;
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractTableRows(html) {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const cells = [];
    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      cells.push(stripHtml(cellMatch[1]));
    }

    if (cells.length >= 3) {
      rows.push(cells);
    }
  }

  return rows;
}

async function getBlueRidgeParkwayStatus() {
  const parkwayResponse = await fetch(parkwaySourceUrl, {
    headers: requestHeaders,
  });

  if (!parkwayResponse.ok) {
    throw new Error(`Parkway request failed with ${parkwayResponse.status}`);
  }

  const html = await parkwayResponse.text();
  const rows = extractTableRows(html);
  const targetRows = rows.filter((cells) => ashevilleParkwaySections.has(cells[0]));

  if (targetRows.length !== ashevilleParkwaySections.size) {
    throw new Error("Target Asheville parkway rows were not found");
  }

  const status = targetRows.some((cells) => /^closed$/i.test(cells[2])) ? "Closed" : "Open";

  return {
    status,
    actionUrl: closedSectionLink,
  };
}

async function getVenueEvents(venueId) {
  const venueConfig = venueConfigMap.get(venueId);

  if (!venueConfig) {
    return null;
  }

  const response = await fetch(venueConfig.sourceUrl, {
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error(`${venueConfig.label} request failed with ${response.status}`);
  }

  const sourceText = await response.text();
  const events = venueConfig.parser(sourceText).slice(0, 6);

  return {
    venue: venueConfig.id,
    label: venueConfig.label,
    fetchedAt: new Date().toISOString(),
    events,
  };
}

function parseIcalVenueEvents(icalText) {
  const unfolded = icalText.replace(/\r?\n[ \t]/g, "");
  const events = [];

  for (const block of unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gim) || []) {
    const title = decodeIcalText(getIcalField(block, "SUMMARY"));
    const url = decodeIcalText(getIcalField(block, "URL"));
    const dtStart = getIcalField(block, "DTSTART");
    const location = decodeIcalText(getIcalField(block, "LOCATION"));

    if (!title || !url || !dtStart) {
      continue;
    }

    events.push({
      title,
      url,
      dateText: formatIcalDateText(dtStart),
      metaText: location || "",
    });
  }

  return dedupeVenueEvents(events);
}

function parseRhpVenueEvents(html) {
  const events = [];
  const blockPattern =
    /<div class\s*=\s*"[^"]*eventWrapper[^"]*rhpSingleEvent[^"]*"[\s\S]*?<!-- end event list wrapper -->/gi;

  for (const match of html.matchAll(blockPattern)) {
    const block = match[0];
    const url = getFirstMatch(
      block,
      /<a[^>]+href="([^"]+\/event\/[^"]+)"[^>]*rel="bookmark"/i,
    );
    const title = normalizeText(
      stripHtml(getFirstMatch(block, /<h2[^>]*>([\s\S]*?)<\/h2>/i)),
    );
    const dateText = normalizeText(
      stripHtml(getFirstMatch(block, /<div id="eventDate"[^>]*>([\s\S]*?)<\/div>/i)),
    );
    const timeText = normalizeText(
      stripHtml(
        getFirstMatch(
          block,
          /<span class\s*=\s*"[^"]*rhp-event__time-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
        ),
      ),
    );
    const tagline = normalizeText(
      stripHtml(
        getFirstMatch(
          block,
          /<div class\s*=\s*"[^"]*eventTagLine[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        ),
      ),
    );
    const notes = normalizeText(
      stripHtml(
        getFirstMatch(
          block,
          /<div class\s*=\s*"[^"]*(?:eventAgeRestriction|rhp-event-notes-box)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        ),
      ),
    );

    if (!title || !url) {
      continue;
    }

    events.push({
      title,
      url,
      dateText: dateText || timeText || "Upcoming event",
      metaText: [timeText && timeText !== dateText ? timeText : "", notes, tagline]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return dedupeVenueEvents(events);
}

function parseHarrahsVenueEvents(html) {
  const events = [];
  const blockPattern = /<div class="slide">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;

  for (const match of html.matchAll(blockPattern)) {
    const block = match[0];
    const title = normalizeText(stripHtml(getFirstMatch(block, /<h3>([\s\S]*?)<\/h3>/i)));
    const detailUrl = getFirstMatch(
      block,
      /<a href="(https:\/\/www\.harrahscherokeecenterasheville\.com\/events\/[^"]+)"[^>]*>\s*<i class="fas fa-info-circle"><\/i>/i,
    );
    const subtitle = normalizeText(
      stripHtml(getFirstMatch(block, /<div class="event-subtitle">\s*([\s\S]*?)\s*<\/div>/i)),
    );
    const month = normalizeText(stripHtml(getFirstMatch(block, /<small>([\s\S]*?)<\/small>/i)));
    const day = normalizeText(stripHtml(getFirstMatch(block, /<small>[\s\S]*?<\/small>\s*([0-9]{1,2})/i)));

    if (!title || !detailUrl) {
      continue;
    }

    events.push({
      title,
      url: detailUrl,
      dateText: subtitle || [month, day].filter(Boolean).join(" "),
      metaText: "",
    });
  }

  return dedupeVenueEvents(events);
}

function parseRevivalVenueEvents(html) {
  const events = [];
  const blockPattern =
    /<div[^>]+class="ca-info w-dyn-item"[\s\S]*?<div class="button-prime tickets">buy tickets<\/div><\/div><\/a><\/div>/gi;

  for (const match of html.matchAll(blockPattern)) {
    const block = match[0];
    const url = getFirstMatch(
      block,
      /<a[^>]+href="([^"]+)"[^>]+class="cal-container-2 w-inline-block"/i,
    );
    const title = normalizeText(
      stripHtml(getFirstMatch(block, /<div class="b-show-2">([\s\S]*?)<\/div>/i)),
    );
    const weekday = normalizeText(
      stripHtml(getFirstMatch(block, /<p class="b-venue-2 date">([\s\S]*?)<\/p>/i)),
    );
    const date = normalizeText(
      stripHtml(
        getFirstMatch(
          block,
          /<p class="b-venue-2 comma">[\s\S]*?<\/p><p class="b-venue-2 date">([\s\S]*?)<\/p>/i,
        ),
      ),
    );
    const time = normalizeText(
      stripHtml(getFirstMatch(block, /<p class="b-venue-2 date dark">([\s\S]*?)<\/p>/i)),
    );
    const doorText = normalizeText(
      stripHtml(
        getFirstMatch(block, /<p class="b-venue-2 time space">([\s\S]*?)<\/p>/i),
      ),
    );
    const metaText =
      doorText && !/lorem ipsum/i.test(doorText) ? `Doors: ${doorText}` : "";

    if (!title || !url) {
      continue;
    }

    events.push({
      title,
      url,
      dateText: [weekday, date, time].filter(Boolean).join(", ").replace(/,\s*,/g, ","),
      metaText,
    });
  }

  return dedupeVenueEvents(events);
}

function dedupeVenueEvents(events) {
  const seen = new Set();
  const uniqueEvents = [];

  for (const event of events) {
    const key = `${event.url}|${event.title}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueEvents.push(event);
  }

  return uniqueEvents;
}

function getIcalField(block, fieldName) {
  const pattern = new RegExp(`${fieldName}(?:;[^:\\r\\n]+)?:([^\\r\\n]+)`, "i");
  return block.match(pattern)?.[1] || "";
}

function decodeIcalText(value) {
  return decodeHtmlEntities(value)
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\n/gi, " ")
    .trim();
}

function formatIcalDateText(value) {
  const compactValue = value.trim();
  const match = compactValue.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/,
  );

  if (!match) {
    return compactValue;
  }

  const [, year, month, day, hour, minute] = match;
  const asDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);

  if (Number.isNaN(asDate.getTime())) {
    return compactValue;
  }

  return asDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFirstMatch(text, pattern) {
  return text.match(pattern)?.[1] || "";
}

function normalizeText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

  if (requestUrl.pathname === "/api/blue-ridge-parkway-status") {
    try {
      const payload = await getBlueRidgeParkwayStatus();
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(payload));
    } catch (error) {
      response.writeHead(502, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({
          status: "Unavailable",
          actionUrl: closedSectionLink,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
    return;
  }

  if (requestUrl.pathname === "/api/venue-events") {
    const venueId = requestUrl.searchParams.get("venue") || "";
    const venueConfig = venueConfigMap.get(venueId);

    if (!venueConfig) {
      response.writeHead(400, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify({ error: "Unknown venue selection." }));
      return;
    }

    try {
      const payload = await getVenueEvents(venueId);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(payload));
    } catch (error) {
      response.writeHead(502, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({
          error: `Unable to load events for ${venueConfig.label} right now.`,
        }),
      );
    }
    return;
  }

  const filePath = safePathFromUrl(request.url || "/");

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
    return;
  }

  const extension = extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentTypes[extension] || "application/octet-stream",
  });

  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Quiet Playground dev server running at http://127.0.0.1:${port}`);
});
