'use strict';

const VALID_STATUSES = new Set(['verified', 'partial', 'approximate']);
const VALID_CERTAINTIES = new Set(['confirmed', 'approximate']);
const VALID_EVIDENCE_LEVELS = new Set(['official_full_route', 'official_partial_route', 'inferred']);
const VALID_GEOMETRY_METHODS = new Set([
  'organizer_geometry',
  'map_aligned_street_trace',
  'street_routing_estimate',
  'stops_only',
]);
const RENDERABLE_APPROXIMATE_SOURCES = new Set(['official_streets', 'routed_streets']);

function isCoordinate(value) {
  return Boolean(
    value && Number.isFinite(value.longitude) && Number.isFinite(value.latitude) &&
    value.longitude >= -180 && value.longitude <= 180 &&
    value.latitude >= -90 && value.latitude <= 90
  );
}

function toCoordinateObjects(coordinates) {
  return coordinates.map(([longitude, latitude]) => ({ longitude, latitude }));
}

function outAndBack(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('An out-and-back route requires at least two coordinates.');
  }
  return [...coordinates, ...coordinates.slice(0, -1).reverse()];
}

function validateRouteData(routeData) {
  const errors = [];
  if (!routeData || routeData.version !== 1) errors.push('routeData.version must be 1');
  if (!VALID_STATUSES.has(routeData?.status)) errors.push('routeData.status is invalid');
  if (routeData?.evidenceLevel !== undefined && !VALID_EVIDENCE_LEVELS.has(routeData.evidenceLevel)) {
    errors.push('routeData.evidenceLevel is invalid');
  }
  if (routeData?.geometryMethod !== undefined && !VALID_GEOMETRY_METHODS.has(routeData.geometryMethod)) {
    errors.push('routeData.geometryMethod is invalid');
  }

  const confirmedStreetNames = new Set(
    (routeData?.confirmedStreets || []).map((street) => String(street).trim().toLocaleLowerCase('en-CA'))
  );
  for (const [index, stop] of (routeData?.stops || []).entries()) {
    if (!stop.id || !stop.label) errors.push(`stop ${index} needs an id and label`);
    if (!VALID_CERTAINTIES.has(stop.certainty)) errors.push(`stop ${index} certainty is invalid`);
    if (!isCoordinate(stop.coordinates)) errors.push(`stop ${index} coordinates are invalid`);
  }
  for (const [index, segment] of (routeData?.segments || []).entries()) {
    if (!segment.id) errors.push(`segment ${index} needs an id`);
    if (!VALID_CERTAINTIES.has(segment.certainty)) errors.push(`segment ${index} certainty is invalid`);
    if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2 || !segment.coordinates.every(isCoordinate)) {
      errors.push(`segment ${index} coordinates are invalid`);
    }
    if (segment.certainty === 'approximate' && !RENDERABLE_APPROXIMATE_SOURCES.has(segment.source)) {
      errors.push(`segment ${index} would be hidden by the app; approximate segments need official_streets or routed_streets`);
    }
    if (segment.certainty === 'confirmed' && segment.source === 'routed_streets') {
      if (routeData?.status !== 'verified') errors.push(`segment ${index} cannot be confirmed from routed streets unless the route is verified`);
      if (routeData?.evidenceLevel !== 'official_full_route') errors.push(`segment ${index} needs official_full_route evidence`);
      if (routeData?.geometryMethod !== 'map_aligned_street_trace') errors.push(`segment ${index} needs map_aligned_street_trace geometry`);
      if (!segment.streetName || !confirmedStreetNames.has(String(segment.streetName).trim().toLocaleLowerCase('en-CA'))) {
        errors.push(`segment ${index} streetName is not in confirmedStreets`);
      }
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
  return routeData;
}

module.exports = { outAndBack, toCoordinateObjects, validateRouteData };
