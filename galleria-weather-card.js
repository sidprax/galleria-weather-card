class GalleriaWeatherCard extends HTMLElement {
  setConfig(config) {
    this.config = {
      entity: "sensor.open_meteo_weather_raw",
      compact: true,
      ...config
    };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._restoreScroll();
    this._clockTimer = window.setInterval(() => this._updateClockOnly(), 1000);
  }

  disconnectedCallback() {
    if (this._clockTimer) window.clearInterval(this._clockTimer);
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
    this._updateClockOnly();
  }

  getCardSize() {
    return this.config?.compact ? 5 : 7;
  }

  _escape(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
    })[char]);
  }

  _alertIcon(eventName) {
    const ev = (eventName || "").toLowerCase();
    if (ev.includes("heat") || ev.includes("fire") || ev.includes("burn") || ev.includes("red flag")) return "mdi:thermometer-alert";
    if (ev.includes("flood") || ev.includes("rain") || ev.includes("water") || ev.includes("surge")) return "mdi:water-alert";
    if (ev.includes("snow") || ev.includes("blizzard") || ev.includes("winter") || ev.includes("ice") || ev.includes("freeze") || ev.includes("cold") || ev.includes("frost")) return "mdi:snowflake-alert";
    if (ev.includes("wind") || ev.includes("gale") || ev.includes("dust")) return "mdi:weather-windy";
    if (ev.includes("tornado") || ev.includes("funnel")) return "mdi:weather-tornado";
    if (ev.includes("thunderstorm") || ev.includes("storm") || ev.includes("lightning")) return "mdi:weather-lightning";
    return "mdi:alert-decagram";
  }

  _renderAlertBanner(alertState) {
    if (!alertState) return "";
    const count = parseInt(alertState.state || "0", 10);
    const hasAlerts = !isNaN(count) && count > 0;
    if (!hasAlerts) return "";

    const attrs = alertState.attributes || {};
    const eventName = attrs.event || "Weather Alert";
    const severity = (attrs.severity || "Minor").toLowerCase();
    const summary = attrs.summary || attrs.headline || "";
    const expires = attrs.expires || "";
    
    let expiryStr = "";
    if (expires) {
      const d = new Date(expires);
      if (!isNaN(d.getTime())) {
        const use24h = this._timeSettings().use24h;
        expiryStr = ` until ${this._fmtTime(expires, use24h)}`;
      }
    }

    const badgeClass = ["extreme", "severe", "moderate", "minor"].includes(severity) ? severity : "other";
    const alertIcon = this._alertIcon(eventName);

    return `
      <div class="alert-banner ${badgeClass}">
        <ha-icon icon="${alertIcon}"></ha-icon>
        <div class="alert-banner-content">
          <div class="alert-banner-title">
            ${this._escape(eventName)}${this._escape(expiryStr)}
          </div>
          ${summary ? `<div class="alert-banner-desc">${this._escape(summary)}</div>` : ""}
        </div>
      </div>
    `;
  }

  _pad(n) {
    return String(n).padStart(2, "0");
  }

  _fmtTime(ts, use24h, short = false) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "--";
    if (use24h) return short ? `${this._pad(d.getHours())}` : `${this._pad(d.getHours())}:${this._pad(d.getMinutes())}`;
    let h = d.getHours();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return short ? `${h}${ap[0]}` : `${h}:${this._pad(d.getMinutes())} ${ap}`;
  }

  _fmtTransitionTime(ts, use24h) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
    const time = this._fmtTime(ts, use24h, true);
    return sameDay ? time : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  }

  _fmtDate(useLong) {
    return new Date().toLocaleDateString(undefined, useLong
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : { weekday: "short", month: "short", day: "numeric" });
  }

  _parseDailyDate(value) {
    if (typeof value === "string") {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    return new Date(value);
  }

  _codeText(code) {
    const map = {
      0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
      61: "Slight rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow",
      75: "Heavy snow", 80: "Rain showers", 81: "Rain showers", 82: "Heavy showers",
      95: "Thunderstorm", 96: "Thunderstorm hail", 99: "Severe thunderstorm"
    };
    return map[Number(code)] || "Weather";
  }

  _codeToCondition(code) {
    const c = Number(code);
    if (c === 0 || c === 1) return "sunny";
    if (c === 2) return "partlycloudy";
    if (c === 3) return "cloudy";
    if (c === 45 || c === 48) return "fog";
    if ([51, 53, 55, 61, 63, 80, 81].includes(c)) return "rainy";
    if (c === 65 || c === 82) return "pouring";
    if (c >= 71 && c <= 77) return "snowy";
    if (c === 67) return "snowy-rainy";
    if (c === 95) return "lightning";
    if (c === 96 || c === 99) return "lightning-rainy";
    return "cloudy";
  }

  _conditionIcon(condition, hour = 12) {
    const night = hour < 6 || hour >= 20;
    if (condition === "sunny") return night ? "mdi:weather-night" : "mdi:weather-sunny";
    if (condition === "partlycloudy") return night ? "mdi:weather-night-partly-cloudy" : "mdi:weather-partly-cloudy";
    return {
      cloudy: "mdi:weather-cloudy",
      fog: "mdi:weather-fog",
      rainy: "mdi:weather-rainy",
      pouring: "mdi:weather-pouring",
      snowy: "mdi:weather-snowy",
      "snowy-rainy": "mdi:weather-snowy-rainy",
      lightning: "mdi:weather-lightning",
      "lightning-rainy": "mdi:weather-lightning-rainy"
    }[condition] || "mdi:weather-cloudy";
  }

  _meteoconName(code, hour = 12, isDayOverride = undefined) {
    const c = Number(code);
    const isDay = typeof isDayOverride === "boolean" ? isDayOverride : hour >= 6 && hour < 20;
    const day = isDay ? "day" : "night";
    if (c === 0) return isDay ? "clear-day" : "clear-night";
    if (c === 1) return `mostly-clear-${day}`;
    if (c === 2) return `partly-cloudy-${day}`;
    if (c === 3) return "overcast";
    if (c === 45 || c === 48) return isDay ? "fog-day" : "fog-night";
    if (c === 51 || c === 53 || c === 55) return "drizzle";
    if (c === 61 || c === 63 || c === 80 || c === 81) return `partly-cloudy-${day}-rain`;
    if (c === 65 || c === 82) return "overcast-rain";
    if (c >= 71 && c <= 77) return "overcast-snow";
    if (c === 67) return "sleet";
    if (c === 95) return "thunderstorms";
    if (c === 96 || c === 99) return `thunderstorms-${day}-rain`;
    return "not-available";
  }

  _meteoconSrc(name) {
    // Resolve dynamically relative to this script's location
    const baseUrl = import.meta.url
      ? import.meta.url.substring(0, import.meta.url.lastIndexOf("/") + 1)
      : "/hacsfiles/galleria-weather-card/";
    return `${baseUrl}icons/${name}.svg`;
  }

  _conditionColor(condition, hour = 12) {
    const night = hour < 6 || hour >= 20;
    const colors = {
      sunny: night ? "#151a30" : "#f4d24d",
      partlycloudy: night ? "#2b3556" : "#9fcfff",
      cloudy: "#8792a4",
      fog: "#b8c0c8",
      rainy: "#4b9fe8",
      pouring: "#2675d8",
      snowy: "#dbeeff",
      "snowy-rainy": "#9bc8f0",
      lightning: "#b48cff",
      "lightning-rainy": "#8ea2ff"
    };
    return colors[condition] || "#8792a4";
  }

  _tempColor(temp, useC) {
    const f = useC ? (temp * 9 / 5 + 32) : temp;
    const stops = [
      [15, [74, 139, 255]],
      [32, [88, 190, 255]],
      [50, [102, 218, 184]],
      [68, [235, 219, 95]],
      [82, [255, 159, 93]],
      [96, [255, 103, 103]]
    ];
    if (f <= stops[0][0]) return `rgb(${stops[0][1].join(",")})`;
    for (let i = 1; i < stops.length; i++) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      if (f <= t1) {
        const p = (f - t0) / (t1 - t0);
        const rgb = c0.map((v, idx) => Math.round(v + (c1[idx] - v) * p));
        return `rgb(${rgb.join(",")})`;
      }
    }
    return `rgb(${stops[stops.length - 1][1].join(",")})`;
  }

  _unitMode() {
    const configUnit = this.config?.temperature_unit;
    if (configUnit === "C" || configUnit === "c") {
      return { useC: true, unit: "\u00B0C" };
    }
    if (configUnit === "F" || configUnit === "f") {
      return { useC: false, unit: "\u00B0F" };
    }
    const systemUnit = this._hass?.config?.unit_system?.temperature || "°C";
    const useC = systemUnit.includes("C") || systemUnit.includes("c");
    return { useC, unit: useC ? "\u00B0C" : "\u00B0F" };
  }

  _timeSettings() {
    const timeFmt = this.config?.time_format || "auto";
    const dateFmt = this.config?.date_format || "auto";
    let use24h = timeFmt === "24h";
    if (timeFmt === "auto") {
      use24h = this._hass?.locale?.time_format === "24" || false;
    }
    return {
      timeFmt,
      dateFmt,
      use24h,
      useLongDate: dateFmt === "long"
    };
  }

  _toDisplayTemp(celsius, useC) {
    return useC ? celsius : (celsius * 9 / 5 + 32);
  }

  _heroSvg(condition, isDay, intensity, reduceMotion) {
    const dur = intensity === "high" ? "1.8s" : intensity === "low" ? "4.2s" : "3s";
    const anim = reduceMotion ? "none" : `heroFloat ${dur} ease-in-out infinite`;
    const sky = isDay
      ? `<circle cx="86" cy="33" r="21" fill="#f7d64d"></circle><g stroke="#f7d64d" stroke-width="4" stroke-linecap="round"><line x1="86" y1="5" x2="86" y2="15"/><line x1="86" y1="51" x2="86" y2="62"/><line x1="58" y1="33" x2="68" y2="33"/><line x1="104" y1="33" x2="115" y2="33"/></g>`
      : `<circle cx="84" cy="31" r="17" fill="#d7def4"></circle><circle cx="92" cy="26" r="15" fill="#1d2338"></circle><circle cx="62" cy="18" r="1.6" fill="#d7def4"></circle><circle cx="70" cy="12" r="1.2" fill="#d7def4"></circle>`;
    const cloud = `<ellipse cx="58" cy="45" rx="31" ry="17" fill="#dce1e8"/><ellipse cx="36" cy="53" rx="19" ry="14" fill="#cbd2dc"/><ellipse cx="78" cy="54" rx="20" ry="15" fill="#cbd2dc"/><rect x="32" y="45" width="56" height="24" rx="12" fill="#dce1e8"/>`;
    const rain = `<g stroke="#70c7ff" stroke-width="4" stroke-linecap="round"><line x1="42" y1="73" x2="37" y2="86"/><line x1="59" y1="73" x2="54" y2="86"/><line x1="76" y1="73" x2="71" y2="86"/></g>`;
    const snow = `<g fill="#eff8ff"><circle cx="43" cy="80" r="3"/><circle cx="60" cy="80" r="3"/><circle cx="77" cy="80" r="3"/></g>`;
    const bolt = `<polygon points="58,65 48,86 58,84 53,96 72,72 61,74 68,65" fill="#ffd45a"/>`;
    const fog = `<g fill="#cbd2dc"><rect x="25" y="70" width="72" height="4" rx="2"/><rect x="32" y="80" width="60" height="4" rx="2"/></g>`;
    let extra = "";
    if (condition === "rainy" || condition === "pouring") extra = rain;
    if (condition === "snowy" || condition === "snowy-rainy") extra = snow;
    if (condition === "lightning" || condition === "lightning-rainy") extra = bolt;
    if (condition === "fog") extra = fog;
    const body = condition === "sunny" ? sky : `${sky}${cloud}${extra}`;
    return `<svg viewBox="0 0 120 100"><g style="animation:${anim};transform-origin:center;">${body}</g></svg>`;
  }

  _buildRows(hourly, daily, useC, unit, use24h) {
    const hTimes = Array.isArray(hourly.time) ? hourly.time : [];
    const hTempsC = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
    const hPop = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
    const hCode = Array.isArray(hourly.weather_code) ? hourly.weather_code : [];
    const now = new Date();
    let startIdx = 0;
    for (let i = 0; i < hTimes.length; i++) {
      if (new Date(hTimes[i]).getTime() >= now.getTime()) {
        startIdx = i;
        break;
      }
    }
    const hourlyCount = Math.max(1, Math.min(36, parseInt(this.config?.hourly_count || "24", 10)));
    const hourlyRows = [];
    for (let i = startIdx; i < Math.min(hTimes.length, startIdx + hourlyCount); i++) {
      const d = new Date(hTimes[i]);
      const temp = this._toDisplayTemp(Number(hTempsC[i] ?? 0), useC);
      const condition = this._codeToCondition(hCode[i] ?? 2);
      hourlyRows.push({
        time: this._fmtTime(hTimes[i], use24h, true),
        transitionTime: this._fmtTransitionTime(hTimes[i], use24h),
        hour: d.getHours(),
        temp,
        tempText: `${temp.toFixed(0)}${unit}`,
        pop: Number(hPop[i] ?? 0),
        condition,
        icon: this._conditionIcon(condition, d.getHours()),
        iconSrc: this._meteoconSrc(this._meteoconName(hCode[i] ?? 2, d.getHours())),
        conditionColor: this._conditionColor(condition, d.getHours()),
        tempColor: this._tempColor(temp, useC)
      });
    }

    const dTimes = Array.isArray(daily.time) ? daily.time : [];
    const dMaxC = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
    const dMinC = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
    const dPop = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max : [];
    const dCode = Array.isArray(daily.weather_code) ? daily.weather_code : [];
    const dailyCount = Math.max(1, Math.min(10, parseInt(this.config?.daily_count || "7", 10)));
    const dailyRows = [];
    for (let i = 0; i < dTimes.length && dailyRows.length < dailyCount; i++) {
      const dt = this._parseDailyDate(dTimes[i]);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const min = this._toDisplayTemp(Number(dMinC[i] ?? 0), useC);
      const max = this._toDisplayTemp(Number(dMaxC[i] ?? 0), useC);
      const condition = this._codeToCondition(dCode[i] ?? 2);
      dailyRows.push({
        day: dt.getTime() === today.getTime() ? "Today" : dt.toLocaleDateString(undefined, { weekday: "short" }),
        isToday: dt.getTime() === today.getTime(),
        min,
        max,
        rangeText: `${min.toFixed(0)} / ${max.toFixed(0)}${unit}`,
        pop: Number(dPop[i] ?? 0),
        condition,
        icon: this._conditionIcon(condition, 12),
        iconSrc: this._meteoconSrc(this._meteoconName(dCode[i] ?? 2, 12, true)),
        conditionColor: this._conditionColor(condition, 12),
        minColor: this._tempColor(min, useC),
        maxColor: this._tempColor(max, useC)
      });
    }

    return { hourlyRows, dailyRows, hourlyCount, dailyCount };
  }

  _nextTransition(hourlyRows, currentCondition) {
    const nextIndex = hourlyRows.findIndex((r, index) => index > 0 && r.condition !== currentCondition);
    if (nextIndex < 0) return null;
    const next = hourlyRows[nextIndex];
    const endIndex = hourlyRows.findIndex((r, index) => index > nextIndex && r.condition !== next.condition);
    const duration = endIndex < 0 ? hourlyRows.length - nextIndex : endIndex - nextIndex;
    next.brief = duration <= 1;
    if (!next) return null;
    return next;
  }

  _renderHourlyRail(rows) {
    const visibleRows = rows.slice(0, this.config.compact ? 18 : rows.length);
    const gridStyle = `grid-template-columns: repeat(${visibleRows.length}, 38px);`;
    const icons = visibleRows.map((r) => (
      `<div class="hour-icon ${r.condition}"><img src="${r.iconSrc}" alt=""></div>`
    )).join("");
    const temps = visibleRows.map((r) => (
      `<div class="temp-cell" style="background:${r.tempColor}"><span>${r.tempText}</span></div>`
    )).join("");
    const precip = visibleRows.map((r) => (
      `<div class="precip-cell ${r.pop ? "has-pop" : ""}"><div style="height:${r.pop ? Math.max(5, Math.min(100, r.pop)) : 0}%"></div><span>${r.pop ? `${r.pop}%` : ""}</span></div>`
    )).join("");
    const labels = visibleRows.map((r) => `<div class="time-cell">${r.time}</div>`).join("");
    return `
      <div class="hourly-rail" data-scroll-key="hourly">
        <div class="rail-grid icon-row" style="${gridStyle}">${icons}</div>
        <div class="rail-grid temp-row" style="${gridStyle}">${temps}</div>
        <div class="rail-grid precip-row" style="${gridStyle}">${precip}</div>
        <div class="rail-grid label-row" style="${gridStyle}">${labels}</div>
      </div>
    `;
  }

  _renderDailyRail(rows, currentTemp) {
    const minAll = rows.length ? Math.min(...rows.map((r) => r.min)) : 0;
    const maxAll = rows.length ? Math.max(...rows.map((r) => r.max)) : 1;
    const span = Math.max(1, maxAll - minAll);
    return `
      <div class="daily-list" data-scroll-key="daily">
        ${rows.map((r) => {
          const left = ((r.min - minAll) / span) * 100;
          const width = ((r.max - r.min) / span) * 100;
          const currentLeft = ((Math.max(minAll, Math.min(maxAll, currentTemp)) - minAll) / span) * 100;
          return `
            <div class="day-row ${r.condition}" style="--condition:${r.conditionColor};--min:${r.minColor};--max:${r.maxColor};">
              <div class="day-name">${r.day}</div>
              <img class="day-icon" src="${r.iconSrc}" alt="">
              <div class="day-low">${r.min.toFixed(0)}${this._unitMode().unit}</div>
              <div class="day-range">
                <div class="day-range-fill" style="left:${left}%;width:${Math.max(8, width)}%;"></div>
                ${r.isToday ? `<div class="day-current-marker" style="left:${currentLeft}%;"></div>` : ""}
              </div>
              <div class="day-high">${r.max.toFixed(0)}${this._unitMode().unit}</div>
              <div class="day-pop"><ha-icon icon="mdi:water-percent"></ha-icon>${r.pop}%</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  _renderTransition(currentIconSrc, currentText, transition, currentCondition) {
    if (!transition) {
      return `
        <div class="transition-pill ${currentCondition}">
          <span class="transition-copy">Stays ${currentText.toLowerCase()} for the next several hours</span>
        </div>
      `;
    }
    return `
      <div class="transition-pill ${currentCondition}">
        <span class="transition-icon"><img src="${currentIconSrc}" alt=""></span>
        <span class="transition-arrow">→</span>
        <span class="transition-icon"><img src="${transition.iconSrc}" alt=""></span>
        <span class="transition-copy">${transition.brief ? "Briefly " : "Turns "}${this._codeTextFromCondition(transition.condition).toLowerCase()} around ${transition.transitionTime}</span>
      </div>
    `;
  }

  _codeTextFromCondition(condition) {
    return {
      sunny: "Clear",
      partlycloudy: "Partly cloudy",
      cloudy: "Cloudy",
      fog: "Foggy",
      rainy: "Rainy",
      pouring: "Heavy rain",
      snowy: "Snowy",
      "snowy-rainy": "Wintry mix",
      lightning: "Stormy",
      "lightning-rainy": "Stormy rain"
    }[condition] || "Weather";
  }

  render() {
    if (!this.shadowRoot || !this._hass) return;
    const state = this._hass.states[this.config.entity];
    if (!state) {
      this.shadowRoot.innerHTML = `<ha-card><div class="missing">Weather entity not found: ${this.config.entity}</div></ha-card>`;
      return;
    }

    const attrs = state.attributes || {};
    const current = attrs.current || {};
    const hourly = attrs.hourly || {};
    const daily = attrs.daily || {};
    const { useC, unit } = this._unitMode();
    const { timeFmt, dateFmt, use24h, useLongDate } = this._timeSettings();
    const intensity = this.config?.animation_intensity || "medium";
    const reduceMotion = this.config?.reduce_motion === true;
    const tempC = Number(current.temperature_2m ?? 0);
    const feelsC = Number(current.apparent_temperature ?? tempC);
    const humidity = Number(current.relative_humidity_2m ?? 0);
    const pop = Number(current.precipitation_probability ?? 0);
    const code = Number(current.weather_code ?? 2);
    const isDay = Number(current.is_day ?? 1) === 1;
    const condition = this._codeToCondition(code);
    const currentIconSrc = this._meteoconSrc(this._meteoconName(code, new Date().getHours(), isDay));
    const temp = this._toDisplayTemp(tempC, useC);
    const feels = this._toDisplayTemp(feelsC, useC);
    const { hourlyRows, dailyRows, hourlyCount, dailyCount } = this._buildRows(hourly, daily, useC, unit, use24h);
    const transition = this._nextTransition(hourlyRows, condition);

    const previousHourly = this.shadowRoot.querySelector(".hourly-rail");
    const previousDaily = this.shadowRoot.querySelector(".daily-list");
    const previousHScroll = previousHourly ? previousHourly.scrollLeft : (this._savedHScroll || 0);
    const previousDScroll = previousDaily ? previousDaily.scrollTop : (this._savedDScroll || 0);

    const renderKey = JSON.stringify({
      useC,
      timeFmt,
      dateFmt,
      intensity,
      reduceMotion,
      currentTemp: tempC,
      feelsC,
      humidity,
      pop,
      code,
      isDay,
      hourlyCount,
      dailyCount,
      firstHour: hourlyRows[0]?.time,
      firstHourTemp: hourlyRows[0]?.temp,
      firstHourCondition: hourlyRows[0]?.condition,
      transitionTime: transition?.transitionTime,
      transitionCondition: transition?.condition,
      transitionBrief: transition?.brief,
      firstDay: dailyRows[0]?.day,
      firstDayMin: dailyRows[0]?.min,
      firstDayMax: dailyRows[0]?.max,
      firstDayCondition: dailyRows[0]?.condition
    });
    if (this._lastRenderKey === renderKey) return;
    this._lastRenderKey = renderKey;

    this.shadowRoot.innerHTML = `
      <ha-card>
        <div class="weather-card ${this.config.compact ? "compact" : "detail"}">
          ${this._renderAlertBanner(this._hass.states[this.config.alert_entity || "sensor.galleria_weather_alert"])}
          <div class="hero">
            <div class="hero-icon ${condition} ${isDay ? "day" : "night"} ${reduceMotion ? "reduce-motion" : ""}" style="--anim-dur:${intensity === "high" ? "2.8s" : intensity === "low" ? "6s" : "4s"}">
              <img src="${currentIconSrc}" alt="${this._codeText(code)}">
            </div>
            <div class="hero-copy">
              <div class="condition">${this._codeText(code)}</div>
              <div class="metrics">
                <span>${temp.toFixed(1)}${unit}</span>
                <span>${humidity}% Humidity</span>
                <span>Feels ${feels.toFixed(1)}${unit}</span>
                <span>Rain ${pop}%</span>
              </div>
              <div class="clock" data-clock></div>
              <div class="date" data-date>${this._fmtDate(useLongDate)}</div>
              ${this._renderTransition(currentIconSrc, this._codeText(code), transition, condition)}
            </div>
          </div>
          <div class="forecast-block">
            <div class="block-title">Today Hourly</div>
            ${this._renderHourlyRail(hourlyRows)}
          </div>
          <div class="forecast-block">
            <div class="block-title">Weekly</div>
            ${this._renderDailyRail(dailyRows, temp)}
          </div>
        </div>
      </ha-card>
      <style>
        :host { display: block; }
        ha-card {
          background: rgba(25, 25, 25, 0.4);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.25);
          color: var(--primary-text-color);
          font-family: var(--primary-font-family);
          overflow: hidden;
        }
        .weather-card { padding: 12px; display: grid; gap: 12px; }
        .alert-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          margin-bottom: 4px;
          border-radius: 14px;
          font-size: 12px;
          line-height: 1.4;
          font-weight: 500;
          animation: alertPulse 2.4s infinite ease-in-out;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .alert-banner.extreme,
        .alert-banner.severe {
          background: rgba(244, 67, 54, 0.22);
          color: #ff8a80;
          border-color: rgba(244, 67, 54, 0.4);
        }
        .alert-banner.moderate {
          background: rgba(255, 152, 0, 0.18);
          color: #ffd180;
          border-color: rgba(255, 152, 0, 0.35);
        }
        .alert-banner.minor {
          background: rgba(255, 235, 59, 0.14);
          color: #ffe57f;
          border-color: rgba(255, 235, 59, 0.3);
        }
        .alert-banner.other {
          background: rgba(255, 255, 255, 0.08);
          color: #e0e0e0;
          border-color: rgba(255, 255, 255, 0.15);
        }
        .alert-banner-content {
          flex: 1;
        }
        .alert-banner-title {
          font-weight: 700;
          font-size: 13px;
        }
        .alert-banner-desc {
          opacity: 0.88;
          margin-top: 2px;
          font-size: 11px;
        }
        @keyframes alertPulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(0.993); filter: brightness(1.18); }
        }
        .hero {
          display: grid;
          grid-template-columns: 118px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
          min-height: 118px;
        }
        .hero-icon {
          position: relative;
          width: 118px;
          height: 104px;
          display: grid;
          place-items: center;
          isolation: isolate;
        }
        .hero-icon::before {
          content: "";
          position: absolute;
          inset: 18px 14px;
          border-radius: 999px;
          background: radial-gradient(circle, var(--accent-color, rgba(255, 255, 255, 0.45)), transparent 62%);
          filter: blur(14px);
          opacity: 0.44;
          z-index: -1;
          animation: weatherGlow calc(var(--anim-dur) * 1.3) ease-in-out infinite;
        }
        .hero-icon::after {
          content: "";
          position: absolute;
          inset: 8px 12px;
          border-radius: 999px;
          opacity: 0;
          pointer-events: none;
        }
        .hero-icon.sunny::before { background: radial-gradient(circle, rgba(255, 211, 75, 0.65), transparent 64%); }
        .hero-icon.partlycloudy::before { background: radial-gradient(circle, rgba(126, 197, 255, 0.62), transparent 66%); }
        .hero-icon.cloudy::before,
        .hero-icon.fog::before { background: radial-gradient(circle, rgba(185, 196, 210, 0.5), transparent 66%); }
        .hero-icon.rainy::before,
        .hero-icon.pouring::before { background: radial-gradient(circle, rgba(77, 161, 232, 0.62), transparent 64%); }
        .hero-icon.snowy::before,
        .hero-icon.snowy-rainy::before { background: radial-gradient(circle, rgba(219, 238, 255, 0.62), transparent 66%); }
        .hero-icon.lightning::before,
        .hero-icon.lightning-rainy::before { background: radial-gradient(circle, rgba(181, 140, 255, 0.7), transparent 66%); }
        .hero-icon.rainy::after,
        .hero-icon.pouring::after {
          opacity: 0.52;
          background:
            linear-gradient(115deg, transparent 0 34%, rgba(124, 207, 255, 0.85) 35% 37%, transparent 38% 100%),
            linear-gradient(115deg, transparent 0 58%, rgba(124, 207, 255, 0.75) 59% 61%, transparent 62% 100%);
          background-size: 36px 52px, 44px 60px;
          animation: weatherRain calc(var(--anim-dur) * 0.7) linear infinite;
        }
        .hero-icon.snowy::after,
        .hero-icon.snowy-rainy::after {
          opacity: 0.55;
          background:
            radial-gradient(circle, rgba(255, 255, 255, 0.95) 0 2px, transparent 2.5px),
            radial-gradient(circle, rgba(255, 255, 255, 0.78) 0 1.5px, transparent 2px);
          background-size: 28px 28px, 38px 38px;
          animation: weatherSnow calc(var(--anim-dur) * 1.6) linear infinite;
        }
        .hero-icon img {
          width: 116px;
          height: 100px;
          display: block;
          object-fit: contain;
          filter: drop-shadow(0 9px 18px rgba(0, 0, 0, 0.35));
          animation: weatherFloat var(--anim-dur) ease-in-out infinite;
        }
        .hero-icon.sunny.day img { animation-name: weatherPulse; }
        .hero-icon.cloudy img,
        .hero-icon.fog img { animation-name: weatherDrift; }
        .hero-icon.reduce-motion img,
        .hero-icon.reduce-motion::before,
        .hero-icon.reduce-motion::after { animation: none; }
        .hero-copy { min-width: 0; }
        .condition { font-size: 16px; font-weight: 700; line-height: 1.1; }
        .metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 5px 10px;
          color: var(--secondary-text-color);
          font-size: 12px;
          line-height: 1.25;
          margin-top: 5px;
        }
        .clock {
          font-size: 42px;
          line-height: 0.95;
          font-weight: 500;
          margin-top: 7px;
          letter-spacing: 0;
        }
        .date { color: var(--secondary-text-color); font-size: 18px; margin-top: 3px; }
        .transition-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
          margin-top: 8px;
          padding: 4px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: var(--secondary-text-color);
          font-size: 11px;
          font-weight: 700;
          line-height: 1.2;
        }
        .transition-icon {
          width: 18px;
          height: 18px;
          display: inline-grid;
          place-items: center;
          flex: 0 0 18px;
        }
        .transition-icon img {
          width: 18px;
          height: 18px;
          object-fit: contain;
        }
        .transition-arrow {
          color: rgba(255, 255, 255, 0.82);
          font-weight: 900;
        }
        .transition-copy {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .forecast-block { min-width: 0; }
        .block-title {
          color: var(--secondary-text-color);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0;
          margin-bottom: 6px;
        }
        .hourly-rail {
          overflow-x: auto;
          overflow-y: hidden;
          padding-bottom: 0;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.07);
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .hourly-rail::-webkit-scrollbar { display: none; }
        .rail-grid {
          display: grid;
          min-width: max-content;
        }
        .icon-row {
          height: 30px;
          align-items: center;
          background: rgba(0, 0, 0, 0.16);
          border-radius: 12px 12px 0 0;
        }
        .hour-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hour-icon img {
          width: 24px;
          height: 24px;
          object-fit: contain;
          filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.35));
        }
        .temp-row { height: 20px; align-items: stretch; }
        .temp-cell {
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(0, 0, 0, 0.72);
          font-size: 10px;
          font-weight: 800;
          border-right: 1px solid rgba(0, 0, 0, 0.12);
          text-shadow: 0 1px 10px rgba(255, 255, 255, 0.25);
        }
        .precip-row {
          height: 24px;
          align-items: end;
          background: rgba(0, 0, 0, 0.12);
        }
        .precip-cell {
          position: relative;
          height: 24px;
          display: flex;
          align-items: end;
          justify-content: center;
          border-right: 1px solid rgba(255, 255, 255, 0.04);
        }
        .precip-cell div {
          width: 65%;
          max-height: 22px;
          min-height: 0;
          border-radius: 5px 5px 0 0;
          background: linear-gradient(180deg, #72d1ff, #2679e8);
          opacity: 0;
        }
        .precip-cell.has-pop div {
          opacity: 0.9;
        }
        .precip-cell span {
          position: absolute;
          bottom: 1px;
          font-size: 8px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.85);
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
        }
        .label-row {
          height: 21px;
          align-items: center;
          background: rgba(0, 0, 0, 0.22);
          border-radius: 0 0 12px 12px;
        }
        .time-cell {
          text-align: center;
          color: rgba(255, 255, 255, 0.78);
          font-size: 10px;
          font-weight: 700;
        }
        .daily-list {
          display: grid;
          gap: 0;
          max-height: 205px;
          overflow-y: auto;
          padding-right: 0;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .daily-list::-webkit-scrollbar { display: none; }
        .day-row {
          display: grid;
          grid-template-columns: 36px 34px 42px minmax(120px, 1fr) 42px 44px;
          align-items: center;
          gap: 6px;
          min-height: 30px;
          padding: 0 6px;
          border-radius: 0;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.018));
          border: 0;
        }
        .day-row:first-child { border-radius: 9px 9px 0 0; }
        .day-row:last-child { border-radius: 0 0 9px 9px; border-bottom: 0; }
        .day-name {
          font-size: 12px;
          font-weight: 800;
        }
        .day-icon {
          width: 30px;
          height: 30px;
          object-fit: contain;
        }
        .day-low,
        .day-high {
          color: var(--secondary-text-color);
          font-size: 11px;
          font-weight: 700;
          text-align: right;
        }
        .day-high {
          color: var(--primary-text-color);
          text-align: left;
        }
        .day-range {
          position: relative;
          height: 20px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.13);
          overflow: hidden;
        }
        .day-range-fill {
          position: absolute;
          top: 0;
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--min), var(--max));
          box-shadow: 0 0 10px rgba(255, 190, 110, 0.32);
        }
        .day-current-marker {
          position: absolute;
          top: 50%;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: rgba(238, 238, 238, 0.96);
          border: 2px solid rgba(20, 20, 20, 0.72);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.52), 0 2px 8px rgba(0, 0, 0, 0.36);
          transform: translate(-50%, -50%);
          z-index: 2;
        }
        .day-pop {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #7dc8ff;
          font-size: 10px;
          font-weight: 700;
          justify-content: flex-end;
        }
        .day-pop ha-icon { --mdc-icon-size: 13px; }
        .detail .clock { font-size: 54px; }
        .detail .date { font-size: 22px; }
        @keyframes weatherFloat {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -5px, 0) scale(1.015); }
        }
        @keyframes weatherPulse {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); filter: drop-shadow(0 9px 18px rgba(0, 0, 0, 0.35)); }
          50% { transform: translate3d(0, -3px, 0) scale(1.045); filter: drop-shadow(0 0 18px rgba(255, 215, 83, 0.36)); }
        }
        @keyframes weatherDrift {
          0%, 100% { transform: translate3d(-2px, 0, 0); }
          50% { transform: translate3d(3px, -3px, 0); }
        }
        @keyframes weatherGlow {
          0%, 100% { transform: scale(0.92); opacity: 0.32; }
          50% { transform: scale(1.08); opacity: 0.58; }
        }
        @keyframes weatherRain {
          from { background-position: 0 -54px, 18px -60px; }
          to { background-position: -36px 54px, -26px 60px; }
        }
        @keyframes weatherSnow {
          from { background-position: 0 -38px, 14px -46px; }
          to { background-position: 0 38px, 14px 46px; }
        }
        @keyframes heroFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      </style>
    `;

    this._bindScroll(this.shadowRoot.querySelector(".hourly-rail"), "h", previousHScroll);
    this._bindScroll(this.shadowRoot.querySelector(".daily-list"), "d", previousDScroll);
    this._updateClockOnly();
  }

  _updateClockOnly() {
    if (!this.shadowRoot || !this._hass) return;
    const clock = this.shadowRoot.querySelector("[data-clock]");
    const date = this.shadowRoot.querySelector("[data-date]");
    if (!clock) return;
    const { use24h, useLongDate } = this._timeSettings();
    clock.textContent = this._fmtTime(new Date().toISOString(), use24h);
    if (date) date.textContent = this._fmtDate(useLongDate);
  }

  _bindScroll(el, key, position) {
    if (!el) return;
    if (key === "d") {
      el.scrollTop = position || 0;
    } else {
      el.scrollLeft = position || 0;
    }
    el.addEventListener("scroll", () => {
      if (key === "h") this._savedHScroll = el.scrollLeft;
      if (key === "d") this._savedDScroll = el.scrollTop;
      this._persistScroll();
    }, { passive: true });
  }

  _scrollStorageKey() {
    return `galleria_weather_scroll_${this.config?.entity || "sensor.open_meteo_weather_raw"}_${this.config?.compact ? "compact" : "detail"}`;
  }

  _persistScroll() {
    try {
      localStorage.setItem(this._scrollStorageKey(), JSON.stringify({
        h: this._savedHScroll || 0,
        d: this._savedDScroll || 0
      }));
    } catch (e) {}
  }

  _restoreScroll() {
    try {
      const raw = localStorage.getItem(this._scrollStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this._savedHScroll = Number(parsed?.h || 0);
      this._savedDScroll = Number(parsed?.d || 0);
    } catch (e) {}
  }
}

if (!customElements.get("galleria-weather-card")) {
  customElements.define("galleria-weather-card", GalleriaWeatherCard);
}
