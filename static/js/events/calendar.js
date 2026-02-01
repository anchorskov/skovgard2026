// static/js/events/calendar.js

(function () {
  function qs(id) {
    return document.getElementById(id);
  }

  function mapsUrlForLocation(loc) {
    const q = encodeURIComponent(String(loc || "").trim());
    if (!q) return "";
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  document.addEventListener("DOMContentLoaded", function () {
    const el = qs("campaign-calendar");
    if (!el || !window.FullCalendar) return;

    const calendar = new FullCalendar.Calendar(el, {
      initialView: "dayGridMonth",
      contentHeight: "auto",
      expandRows: true,
      handleWindowResize: true,
      nowIndicator: true,

      headerToolbar: {
        left: "prev,next today refresh",
        center: "title",
        right: "dayGridMonth,timeGridWeek,listWeek",
      },

      customButtons: {
        refresh: {
          text: "Refresh",
          click: function () {
            calendar.refetchEvents();
          },
        },
      },

      events: {
        url: "/api/events.ics",
        format: "ics",
      },

      eventClick: function (info) {
        const loc = info?.event?.extendedProps?.location || info?.event?.location;
        const url = mapsUrlForLocation(loc);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      },
    });

    calendar.render();

    setTimeout(function () {
      calendar.updateSize();
    }, 0);

    window.addEventListener("resize", function () {
      calendar.updateSize();
    });
  });
})();
