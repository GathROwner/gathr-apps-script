'use strict';

const VALID_STATUSES = new Set(['verified', 'partial']);
const VALID_CERTAINTIES = new Set(['confirmed', 'approximate']);

function isCoordinate(value) {
  return Boolean(
    value &&
      Number.isFinite(value.longitude) &&
      Number.isFinite(value.latitude) &&
      value.longitude >= -180 &&
      value.longitude <= 180 &&
      value.latitude >= -90 &&
      value.latitude <= 90
  );
}

function validateAreaData(areaData) {
  const errors = [];
  if (!areaData || areaData.version !== 1) errors.push('areaData.version must be 1');
  if (!VALID_STATUSES.has(areaData?.status)) errors.push('areaData.status is invalid');
  if (!Array.isArray(areaData?.locations) || areaData.locations.length < 1) {
    errors.push('areaData.locations needs at least one location');
  }

  const ids = new Set();
  for (const [index, location] of (areaData?.locations || []).entries()) {
    if (!location.id || !location.label) {
      errors.push(`location ${index} needs an id and label`);
    }
    if (ids.has(location.id)) errors.push(`location ${index} id is duplicated`);
    ids.add(location.id);
    if (!VALID_CERTAINTIES.has(location.certainty)) {
      errors.push(`location ${index} certainty is invalid`);
    }
    if (!isCoordinate(location.coordinates)) {
      errors.push(`location ${index} coordinates are invalid`);
    }
  }

  if (areaData?.segments || areaData?.route || areaData?.orderedLocations) {
    errors.push('areaData cannot imply an ordered route or connecting line');
  }

  if (errors.length) throw new Error(errors.join('; '));
  return areaData;
}

module.exports = { validateAreaData };
