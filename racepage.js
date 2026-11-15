/** Race page DOM. The view model comes from racemodel.js. */

import { nationFlag } from "./live.js";
import { formatTvDelay } from "./live.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function who(nation, name) {
  return [nationFlag(nation), nation, name].filter(Boolean).join(" ");
}

export function renderRacePage(root, view, actions) {
  root.replaceChildren();
  const page = el("article", "race-page");
  page.setAttribute("aria-label", view.title || "Race");

  const back = el("a", "back", "Races");
  back.href = "#races";
  back.addEventListener("click", (event) => {
    event.preventDefault();
    actions.onBack();
  });
  page.append(back);

  const head = el("header", "race-head");
  if (view.kicker) head.append(el("p", "kicker", view.kicker));
  head.append(el("h1", "", view.title || ""));
  if (view.venue) head.append(el("p", "venue", view.venue));
  if (view.when) head.append(el("p", "when", view.when));
  if (view.times) head.append(view.times);
  if (view.team) head.append(view.team);
  page.append(head);

  if (view.waiting) {
    page.append(el("p", "quiet", "Waiting for the first timing update."));
    root.append(page);
    return;
  }

  if (view.judged) {
    page.append(el("p", "judged", "This is a judged event. Timing splits are not on the live feed."));
    if (actions.liveHref) page.append(textLink(actions.liveHref, "FIS live page"));
    root.append(page);
    return;
  }

  if (view.model.status.text || view.model.age) {
    const bar = el("section", "status-bar");
    bar.append(el("p", "status-line", view.model.status.text));
    const track = el("div", "progress");
    track.setAttribute("role", "progressbar");
    const pct = Math.round((view.model.status.progress || 0) * 100);
    track.setAttribute("aria-valuenow", String(pct));
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    const fill = el("span");
    fill.style.width = `${pct}%`;
    track.append(fill);
    bar.append(track);
    const meta = el("p", "status-meta");
    if (view.model.status.dnf) meta.append(el("span", "", view.model.status.dnf));
    if (view.model.age) {
      const age = el("span", "age", view.model.age);
      if (view.updatedAt) age.dataset.at = String(view.updatedAt);
      meta.append(age);
    }
    bar.append(meta);
    page.append(bar);
  }

  const course = el("section", "on-now");
  const courseTitle = el("p", "role");
  const dot = el("span", "dot");
  dot.setAttribute("aria-hidden", "true");
  courseTitle.append(dot, document.createTextNode(" On course"));
  course.append(courseTitle);
  if (!view.model.onCourse.length) {
    course.classList.add("clear");
    course.append(el("p", "quiet", view.model.status.text.startsWith("Finished") ? "Race over" : "Course is clear"));
  } else {
    for (const skier of view.model.onCourse) {
      const row = el("div", "on-skier");
      row.append(el("b", "bib", String(skier.bib)));
      const name = el("div", "on-name");
      name.append(el("p", "nm", who(skier.nation, skier.name)));
      if (skier.note) name.append(el("p", "note", skier.note));
      row.append(name);
      const sync = el("button", "sync", "Sync");
      sync.type = "button";
      sync.setAttribute("aria-label", `Sync TV to ${skier.bib} ${skier.name}`);
      sync.disabled = !actions.canSync?.(skier.person);
      sync.title = sync.disabled
        ? "Waiting until the live timing shows this start."
        : "Tap when this skier leaves the start on TV.";
      sync.addEventListener("click", () => actions.onSync?.(skier.person));
      row.append(sync);
      course.append(row);
    }
  }
  page.append(course);

  if (view.model.leader) {
    const leader = el("section", "leader-card");
    leader.append(el("p", "role", view.model.leader.note));
    leader.append(el("p", "lead-name", who(view.model.leader.nation, view.model.leader.name)));
    if (view.model.leader.time) leader.append(el("p", "lead-time", view.model.leader.time));
    page.append(leader);
  }

  if (view.model.last) {
    const last = el("section", "last-card");
    last.append(el("p", "role", "Last finisher"));
    const line = el("p", "last-line");
    line.append(el("span", "nm", who(view.model.last.nation, view.model.last.name)));
    if (view.model.last.time) line.append(el("span", "time", view.model.last.time));
    last.append(line);
    if (view.model.last.delta) last.append(el("p", `delta ${view.model.last.tone}`, view.model.last.delta));
    page.append(last);
  }

  const coming = el("section", "coming");
  const comingCount = view.model.coming.length;
  coming.append(el("p", "role", comingCount ? `Still to come · ${comingCount}` : "Still to come"));
  if (!comingCount) {
    coming.append(el("p", "quiet", "No one left in the start list."));
  } else {
    const list = el("ol", "coming-list");
    for (const skier of view.model.coming) {
      const li = el("li", skier.highlight ? "spot" : "");
      li.append(el("b", "queue", skier.label));
      li.append(el("b", "bib", String(skier.bib)));
      const name = el("span", "nm");
      name.append(el("span", "", who(skier.nation, skier.name)));
      if (skier.run1) name.append(el("span", "run1", skier.run1));
      li.append(name);
      list.append(li);
    }
    coming.append(list);
  }
  page.append(coming);

  const results = el("section", "results-fold");
  const toggle = el("button", "fold", view.resultsOpen ? "Hide results" : "Results");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", String(!!view.resultsOpen));
  toggle.addEventListener("click", () => actions.onToggleResults?.());
  results.append(toggle);
  if (view.resultsOpen) {
    const list = el("ol", "result-list");
    const rows = view.model.results.length ? view.model.results : [];
    if (!rows.length) list.append(el("li", "quiet", "No results yet."));
    for (const row of rows) {
      const li = el("li", row.dnf ? "dnf" : "");
      li.append(el("b", "place", row.rank === "" ? "" : String(row.rank)));
      li.append(el("span", "nm", who(row.nation, row.name)));
      li.append(el("span", "mark", row.mark));
      list.append(li);
    }
    results.append(list);
  }
  page.append(results);

  const delay = el("section", "delay-bar");
  const summary = el("button", "delay-summary", `TV delay ${formatTvDelay(view.delayMs || 0)}`);
  summary.type = "button";
  summary.setAttribute("aria-expanded", String(!!view.delayOpen));
  summary.addEventListener("click", () => actions.onToggleDelay?.());
  delay.append(summary);
  if (view.delayOpen) {
    const actionsRow = el("div", "tv-actions");
    const minus = el("button", "", "-5s");
    minus.type = "button";
    minus.setAttribute("aria-label", "Subtract 5 seconds from the TV delay");
    minus.addEventListener("click", () => actions.onNudge?.(-5000));
    const plus = el("button", "", "+5s");
    plus.type = "button";
    plus.setAttribute("aria-label", "Add 5 seconds to the TV delay");
    plus.addEventListener("click", () => actions.onNudge?.(5000));
    const live = el("button", "", "Live");
    live.type = "button";
    live.setAttribute("aria-label", "Clear the TV delay and show live timing");
    live.disabled = !(view.delayMs > 0);
    live.addEventListener("click", () => actions.onLive?.());
    actionsRow.append(minus, plus, live);
    delay.append(actionsRow);
    delay.append(el("p", "tv-hint", "Tap Sync when the skier on course leaves the start on TV."));
    if (view.syncNote) delay.append(el("p", "tv-note", view.syncNote));
  }
  page.append(delay);

  if (actions.liveHref) page.append(textLink(actions.liveHref, "FIS timing"));
  root.append(page);
}

function textLink(href, label) {
  const anchor = el("a", "text-link", label);
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}
