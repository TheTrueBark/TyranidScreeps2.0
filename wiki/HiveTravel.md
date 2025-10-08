# 🛸 HiveTravel Movement Library

This project integrates the [Traveler](https://github.com/screepers/Traveler) library for creep pathing under the name **HiveTravel**.
It provides efficient path caching and single lane traffic handling.

## Usage

Require the module once in `main.js`:
```javascript
const hiveTravel = require('manager.hiveTravel');
```
Creeps can then move with `travelTo` which replaces `moveTo`:
```javascript
creep.travelTo(target);
```
See the Traveler README for advanced options such as path reuse and hostile room avoidance.


