// EventScrapelocationEnrichment.gs

function enrichEstablishmentName(establishmentName, address, latitude, longitude) {
  console.log(`enrichEstablishmentName : Event Found with bad name : Enriching establishment name: "${establishmentName}"`);
  console.log(`enrichEstablishmentName : Using address: "${address}", lat: ${latitude}, long: ${longitude}`);

  // Ensure latitude and longitude are numbers
  latitude = parseFloat(latitude);
  longitude = parseFloat(longitude);

  if (isNaN(latitude) || isNaN(longitude)) {
    console.log("enrichEstablishmentName : Invalid coordinates. Skipping enrichment.");
    return establishmentName;
  }

  const apiKey = getGooglePlacesApiKey(); // This function is from googlePlacesUtils.gs
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=100&key=${apiKey}`;

  console.log("enrichEstablishmentName : Sending request to Google Places API");
  try {
    const response = UrlFetchApp.fetch(url);
    const result = JSON.parse(response.getContentText());
    console.log("enrichEstablishmentName : Received response from Google Places API");
    console.log("enrichEstablishmentName : API Results:", JSON.stringify(result.results, null, 2));

    if (result.status === "OK" && result.results.length > 0) {
      // First, try to find an address match
      const addressMatch = result.results.find(place => 
        isAddressMatch(place.vicinity, address)
      );

      if (addressMatch) {
        console.log(`enrichEstablishmentName : Address match found: "${addressMatch.name}" at "${addressMatch.vicinity}"`);
        if (isSignificantlyDifferent(establishmentName, addressMatch.name)) {
          console.log(`enrichEstablishmentName : Enriched establishment name: "${addressMatch.name}"`);
          return addressMatch.name;
        } else {
          console.log("enrichEstablishmentName : Address match is not significantly different from original name. Keeping original.");
          return establishmentName;
        }
      }

      // If no address match, fall back to nearest place
      console.log("enrichEstablishmentName : No address match found. Falling back to nearest place.");
      result.results.sort((a, b) => 
        getDistance(latitude, longitude, a.geometry.location.lat, a.geometry.location.lng) -
        getDistance(latitude, longitude, b.geometry.location.lat, b.geometry.location.lng)
      );

      const nearestPlace = result.results[0];
      console.log(`enrichEstablishmentName : Nearest place found: "${nearestPlace.name}" at "${nearestPlace.vicinity}"`);

      if (isSignificantlyDifferent(establishmentName, nearestPlace.name)) {
        console.log(`enrichEstablishmentName : Enriched establishment name: "${nearestPlace.name}"`);
        return nearestPlace.name;
      } else {
        console.log("enrichEstablishmentName : Nearest place is not significantly different from original name. Keeping original.");
        return establishmentName;
      }
    } else {
      console.log("enrichEstablishmentName : No suitable places found near the given coordinates");
      return establishmentName;
    }
  } catch (error) {
    console.error("enrichEstablishmentName : Error occurred while querying Google Places API:", error);
    return establishmentName;
  }
}

function normalizeAddress(address) {
  console.log(`normalizeAddress : for enriching Event: Normalizing address: "${address}"`);
  let normalized = address.toLowerCase()
                          .replace(/\s+/g, ' ')
                          .replace(/[.,]/g, '')
                          .trim();
  
  // Normalize street type abbreviations
  normalized = normalizeStreetTypes(normalized);
  
  console.log(`normalizeAddress : for enriching Event: Normalized address: "${normalized}"`);
  return normalized;
}

function normalizeStreetTypes(address) {
  console.log(`normalizeStreetTypes : for enriching Event: Normalizing street types in: "${address}"`);
  const streetTypes = {
    'st': 'street',
    'rd': 'road',
    'ave': 'avenue',
    'blvd': 'boulevard',
    'dr': 'drive',
    'ln': 'lane',
    'ct': 'court',
    'pl': 'place',
    'ter': 'terrace',
    'cres': 'crescent'
  };

  for (let [abbr, full] of Object.entries(streetTypes)) {
    let regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    address = address.replace(regex, full);
  }

  console.log(`normalizeStreetTypes : for enriching Event: Address with normalized street types: "${address}"`);
  return address;
}

function parseAddress(address) {
  console.log(`Parsing address: for enriching Event: "${address}"`);
  
  const parts = address.split(' ');
  const result = {
    streetNumber: '',
    streetName: '',
    city: '',
    province: '',
    postalCode: '',
    country: ''
  };

  // Extract street number
  if (/^\d+$/.test(parts[0])) {
    result.streetNumber = parts.shift();
    console.log(`Street number found:  for enriching Event: ${result.streetNumber}`);
  }

  // Extract country (if present)
  if (parts[parts.length - 1].toLowerCase() === 'canada') {
    result.country = parts.pop();
    console.log(`Country found:  for enriching Event : ${result.country}`);
  }

  // Extract postal code (if present)
  const postalCodeRegex = /[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/;
  const postalCodeMatch = address.match(postalCodeRegex);
  if (postalCodeMatch) {
    result.postalCode = postalCodeMatch[0];
    parts.splice(parts.indexOf(result.postalCode.split(' ')[0]), result.postalCode.split(' ').length);
    console.log(`Postal code found: for enriching Event :${result.postalCode}`);
  }

  // Extract province (if present)
  const provinceRegex = /\b(PE|NB|NS|NL|QC|ON|MB|SK|AB|BC|YT|NT|NU)\b/i;
  const provinceMatch = parts.find(part => provinceRegex.test(part));
  if (provinceMatch) {
    result.province = provinceMatch.toUpperCase();
    parts.splice(parts.indexOf(provinceMatch), 1);
    console.log(`Province found:  for enriching Event: ${result.province}`);
  }

  // Extract city (assume it's the last word unless we've already identified country/province/postal code)
  if (parts.length > 1) {
    result.city = parts.pop();
    console.log(`City found:  for enriching Event: ${result.city}`);
  }

  // The rest is considered the street name
  result.streetName = parts.join(' ');
  console.log(`Street name:  for enriching Event:${result.streetName}`);

  console.log("Parsed address components for enriching Event:", JSON.stringify(result, null, 2));
  return result;
}

function isAddressMatch(placeAddress, inputAddress) {
  const normalizedPlaceAddress = normalizeAddress(placeAddress);
  const normalizedInputAddress = normalizeAddress(inputAddress);

  console.log(`Comparing normalized addresses for enriching Event:: "${normalizedPlaceAddress}" and "${normalizedInputAddress}"`);

  const placeComponents = parseAddress(normalizedPlaceAddress);
  const inputComponents = parseAddress(normalizedInputAddress);

  // Check if street number and name match
  if (placeComponents.streetNumber === inputComponents.streetNumber &&
      placeComponents.streetName === inputComponents.streetName) {
    console.log("Street number and name match");
    
    // If city is available in both, check if it matches
    if (placeComponents.city && inputComponents.city) {
      if (placeComponents.city === inputComponents.city) {
        console.log("City matches");
        return true;
      } else {
        console.log("City does not match");
        return false;
      }
    } else {
      // If city is not available in one or both, consider it a match based on street
      console.log("Matched based on street, city information incomplete");
      return true;
    }
  }

  console.log("No address match found");
  return false;
}

function getDistance(lat1, lon1, lat2, lon2) {
  console.log(`Calculating distance between (${lat1}, ${lon1}) and (${lat2}, ${lon2})`);
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  console.log(`Calculated distance: ${d} km`);
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

function isSignificantlyDifferent(original, found) {
  console.log(`Comparing "${original}" and "${found}" for significant difference`);
  const originalWords = original.toLowerCase().split(/\s+/);
  const foundWords = found.toLowerCase().split(/\s+/);
  const commonWords = originalWords.filter(word => foundWords.includes(word));
  const similarity = commonWords.length / Math.max(originalWords.length, foundWords.length);
  
  console.log(`Similarity between "${original}" and "${found}": ${similarity}`);
  return similarity < 0.5; // Adjust this threshold as needed
}

function isAddressLike(name) {
  console.log(`Checking if '${name}' is address-like`);

  const lowercaseName = name.toLowerCase();

  const addressPatterns = [
    /\d+\s+\w+\s+(st|street|ave|avenue|rd|road|lane|ln|drive|dr|circle|cir|court|ct|place|pl|boulevard|blvd)/,
    /p\.?o\.?\s*box\s+\d+/,
    /\b(suite|ste|apt|apartment|unit|#)\s*\d+/,
    /\b[a-z]{2}\s+\d{5}(-\d{4})?$/
  ];

  const foundPatterns = addressPatterns.filter(pattern => pattern.test(lowercaseName));

  if (foundPatterns.length > 0) {
    console.log(`Address-like elements found in '${name}':`, foundPatterns.map(p => p.toString()));
    return true;
  }

  if (/\d/.test(name)) {
    console.log(`'${name}' contains numbers, which is common in addresses`);
    return true;
  }

  console.log(`'${name}' does not appear to be address-like`);
  return false;
}

function isLikelyAddress(str) {
  // Check for standard street addresses, including HWY
  const streetAddressPattern = /(#?\d+[-\s]?[A-Z]?|[A-Z]?\d+[-\s]?#?)\s+(HWY|Highway|Hwy|St|Ave|Rd|Blvd|Dr|Ln|Ct|Pl|Terrace|Drive|Street|Avenue|Road|Lane|Court|Place)\s*\.?\s*\d*/i;
  
  // Check for city, province/state patterns
  const cityProvincePattern = /([A-Z][a-z]+(\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})/;
  
  // Check for postal code patterns (Canadian and US)
  const postalCodePattern = /[A-Z]\d[A-Z]\s*\d[A-Z]\d|^\d{5}(-\d{4})?$/;
  
  // Check for multiple commas (typical in addresses)
  const multipleCommasPattern = /^[^,]+,.*,/;
  
  // List of words that indicate it's likely a location name, not an address
  const locationKeywords = ['yoga', 'crossfit', 'rodd', 'park', 'space', 'centre', 'center', 'hall', 'arena', 'stadium', 'theatre', 'theater', 'cafe', 'restaurant', 'bar', 'pub'];
  
  return (streetAddressPattern.test(str) || 
          cityProvincePattern.test(str) || 
          postalCodePattern.test(str) ||
          multipleCommasPattern.test(str)) &&
         !locationKeywords.some(keyword => str.toLowerCase().includes(keyword));
}