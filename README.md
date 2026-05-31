# Galleria Weather Card

A premium, interactive, and beautifully animated custom Lovelace weather card for [Home Assistant](https://www.home-assistant.io/). Built from the ground up for high-fidelity aesthetics, modern gradients, glassmorphism blur effects, and smooth micro-animations.

The card is **100% self-contained**—all configurations, unit toggles, and asset mapping are handled directly inside the Lovelace card parameters without requiring any custom theme-level variables, backend font automation wrappers, or entity overrides.

---

## Key Features

* **Premium Aesthetics**: Blurry backdrop filters, soft ambient glow matching the active weather conditions, premium Outfit/Montserrat-inspired typography, and sleek modern card borders.
* **Animated Meteocons Library**: Bundled with a full suite of beautifully animated, high-performance SVG weather icons.
* **Self-Contained F/C Conversion**: Select between Celsius and Fahrenheit dynamically directly in your Lovelace configuration card.
* ** chronological Weather Transitions**: Summarizes when conditions will change in plain, readable copy (e.g., *"Turns rainy around 4:00 PM"*, *"Briefly cloudy around 9:00 AM"*).
* **Forecast Timeline Scroll Wheels**: Hourly and daily forecasts compiled into touch-friendly horizontal and vertical scroll rails.
* **Persistent Scroll Memory**: Remembers exactly where you scrolled in the hourly timeline even after dashboard page updates or browser reloads.
* **Detail & Compact Modes**: Toggles between a compact sidebar-friendly layout and a detailed layout.

---

## 1. Installation

### Method A: HACS Custom Repository (Recommended)

1. Open **HACS** in your Home Assistant sidebar.
2. Click the three dots in the top-right corner and select **Custom repositories**.
3. Paste the URL of your repository: `https://github.com/sidprax/galleria-weather-card`
4. Choose **Lovelace** as the category and click **Add**.
5. Click the new card and select **Download**.
6. Refresh your browser!

### Method B: Manual Installation

1. Download `galleria-weather-card.js` and the `icons/` folder.
2. Copy them into your Home Assistant configuration directory under `www/community/galleria-weather-card/`:
   ```
   config/www/community/galleria-weather-card/
   ├── galleria-weather-card.js
   └── icons/
       ├── clear-day.svg
       ├── cloudy.svg
       └── ...
   ```
3. Register the resource in your Lovelace dashboard resources configuration:
   * **URL**: `/local/community/galleria-weather-card/galleria-weather-card.js`
   * **Type**: `JavaScript Module`

---

## 2. Prerequisites: REST Sensor Configuration

The card relies on a single raw weather data feed from the free public **Open-Meteo API**. 

Copy this YAML package definition into your Home Assistant `configuration.yaml` (or save it as a package file, e.g., `packages/weather_open_meteo.yaml`) to set up the raw rest data feeder sensor `sensor.open_meteo_weather_raw` matching your home coordinates:

```yaml
# =========================================================================
# OPEN-METEO WEATHER DATA SOURCE CONFIGURATION
# =========================================================================

rest:
  - resource_template: >-
      {% set lat = state_attr('zone.home', 'latitude') %}
      {% set lon = state_attr('zone.home', 'longitude') %}
      https://api.open-meteo.com/v1/forecast?latitude={{ lat }}&longitude={{ lon }}&timezone=auto&forecast_days=10&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,is_day&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max
    scan_interval: 900 # Refresh weather data every 15 minutes
    timeout: 30
    sensor:
      - name: open_meteo_weather_raw
        unique_id: open_meteo_weather_raw
        value_template: "{{ value_json.current.time if value_json.current is defined else now().isoformat() }}"
        json_attributes:
          - current
          - hourly
          - daily
```

Ensure you reload rest configs or restart Home Assistant after saving this package file!

---

## 3. Configuration Reference

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `type` | string | **Required** | Must be `custom:galleria-weather-card`. |
| `entity` | string | `sensor.open_meteo_weather_raw` | The weather raw feeder sensor entity. |
| `compact` | boolean | `true` | Set to `true` for a compact dashboard layout, or `false` for full grid details. |
| `temperature_unit` | string | `auto` | Force display units: `C`, `F`, or `auto` (defaults to HA unit system settings). |
| `time_format` | string | `auto` | Force clock display style: `12h`, `24h`, or `auto` (reads local HA profile). |
| `date_format` | string | `auto` | Force date naming: `short`, `long`, or `auto`. |
| `animation_intensity` | string | `medium` | Dynamic floating animation speed: `low` (slow), `medium`, or `high` (fast). |
| `reduce_motion` | boolean | `false` | Disable animated background pulses and SVG drifts. |
| `hourly_count` | integer | `24` | The number of hours to compile in the scroll rail (1 to 36). |
| `daily_count` | integer | `7` | The number of days to display in the forecast rail (1 to 10). |

---

## 4. Usage Examples

### Minimal Configuration (Compact View)
```yaml
type: custom:galleria-weather-card
entity: sensor.open_meteo_weather_raw
compact: true
```

### Premium Detailed Configuration (Fahrenheit Override)
```yaml
type: custom:galleria-weather-card
entity: sensor.open_meteo_weather_raw
compact: false
temperature_unit: F
time_format: 12h
date_format: long
animation_intensity: medium
hourly_count: 24
daily_count: 7
```

### Minimal Celsius Configuration
```yaml
type: custom:galleria-weather-card
entity: sensor.open_meteo_weather_raw
compact: true
temperature_unit: C
time_format: 24h
```

---

## License

This project is licensed under the MIT License. Weather icons provided by Meteocons.
