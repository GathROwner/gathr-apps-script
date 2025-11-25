// tripAdvisorUtils.gs

const TRIPADVISOR_API_BASE_URL = 'https://api.content.tripadvisor.com/api/v1';

// Implement rate limiting
const RATE_LIMIT = 10; // Requests per second
const RATE_LIMIT_WINDOW = 1000; // 1 second in milliseconds
let lastRequestTime = 0;
let requestCount = 0;

function getTripadvisorApiKey() {
  return PropertiesService.getScriptProperties().getProperty('TRIPADVISOR_API_KEY');
}

function rateLimitedFetch(url, options) {
  const now = Date.now();
  if (now - lastRequestTime > RATE_LIMIT_WINDOW) {
    requestCount = 0;
    lastRequestTime = now;
  }

  if (requestCount >= RATE_LIMIT) {
    const delay = RATE_LIMIT_WINDOW - (now - lastRequestTime);
    Utilities.sleep(delay);
    return rateLimitedFetch(url, options);
  }

  requestCount++;
  return UrlFetchApp.fetch(url, options);
}

function searchTripAdvisorLocation(establishmentName, address) {
  console.log(`Entering searchTripAdvisorLocation for: ${establishmentName}, ${address}`);
  console.log(`ENABLE_TRIPADVISOR_API is set to: ${ENABLE_TRIPADVISOR_API}`);

  if (!ENABLE_TRIPADVISOR_API) {
    console.log('TripAdvisor API calls are disabled.');
    return null;
  }

  const searchEndpoint = `${TRIPADVISOR_API_BASE_URL}/location/search`;
  const searchParams = {
    key: getTripadvisorApiKey(),
    searchQuery: `${establishmentName} ${address}`,
    language: 'en'
  };
  
  const searchOptions = {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json'
    }
  };
  
  try {
    console.log(`Searching TripAdvisor for: ${searchParams.searchQuery}`);
    const response = rateLimitedFetch(searchEndpoint + '?' + Object.entries(searchParams).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&'), searchOptions);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    console.log(`TripAdvisor search response code: ${responseCode}`);
    console.log(`TripAdvisor search response body: ${responseBody}`);
    
    if (responseCode !== 200) {
      console.error(`TripAdvisor API error: ${responseCode} ${responseBody}`);
      return null;
    }
    
    const data = JSON.parse(responseBody);
    
    if (data.data && data.data.length > 0) {
      const bestMatch = findBestMatch(data.data, establishmentName, address);
      
      if (bestMatch) {
        console.log(`Best TripAdvisor match found: ${bestMatch.location_id} (${bestMatch.name})`);
        return bestMatch.location_id;
      } else {
        console.log(`No suitable TripAdvisor match found for ${establishmentName}`);
        return null;
      }
    } else {
      console.log(`No TripAdvisor results found for ${establishmentName}`);
      return null;
    }
  } catch (error) {
    console.error(`Error searching TripAdvisor: ${error}`);
    return null;
  }
}

function findBestMatch(locations, establishmentName, address) {
  let bestMatch = null;
  let highestScore = 0;
  
  for (const location of locations) {
    const nameScore = calculateEnhancedNameSimilarity(establishmentName, location.name);
    const addressScore = location.address_obj ? calculateAddressSimilarity(address, location.address_obj.address_string) : 0;
    const totalScore = nameScore * 0.7 + addressScore * 0.3; // Adjust weighting to give more importance to name
    
    console.log(`Matching: ${location.name}`);
    console.log(`Name Score: ${nameScore.toFixed(2)}, Address Score: ${addressScore.toFixed(2)}, Total Score: ${totalScore.toFixed(2)}`);
    
    if (totalScore > highestScore) {
      highestScore = totalScore;
      bestMatch = location;
    }
  }
  
  // Only return a match if the score is above a certain threshold
  if (highestScore > 0.5) {  // Lower threshold slightly
    console.log(`Best match found: ${bestMatch.name} (Score: ${highestScore.toFixed(2)})`);
    return bestMatch;
  } else {
    console.log(`No suitable match found. Highest score: ${highestScore.toFixed(2)}`);
    return null;
  }
}

function getTripAdvisorInfo(locationId) {
  if (!ENABLE_TRIPADVISOR_API) {
    console.log('TripAdvisor API calls are disabled.');
    return null;
  }

  if (!locationId) return null;

  const detailsEndpoint = `${TRIPADVISOR_API_BASE_URL}/location/${locationId}/details`;
  const reviewsEndpoint = `${TRIPADVISOR_API_BASE_URL}/location/${locationId}/reviews`;
  const params = {
    key: getTripadvisorApiKey(),
    language: 'en',
    currency: 'USD'
  };
  
  const options = {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json'
    }
  };
  
  try {
    console.log(`Fetching TripAdvisor details for location ID: ${locationId}`);
    // Fetch location details
    const detailsResponse = rateLimitedFetch(detailsEndpoint + '?' + Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&'), options);
    const detailsData = JSON.parse(detailsResponse.getContentText());
    //console.log(`TripAdvisor details response: ${JSON.stringify(detailsData)}`);

    // Fetch reviews
    const reviewsResponse = rateLimitedFetch(reviewsEndpoint + '?' + Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&'), options);
    const reviewsData = JSON.parse(reviewsResponse.getContentText());
    //console.log(`TripAdvisor reviews response: ${JSON.stringify(reviewsData)}`);

    const tripAdvisorInfo = {
      hours: {},
      rating: detailsData.rating,
      reviews: [],
      source: 'TripAdvisor'
    };

    // Process hours
    if (detailsData.hours && detailsData.hours.weekday_text) {
      detailsData.hours.weekday_text.forEach(dayHours => {
        const [day, hours] = dayHours.split(': ');
        tripAdvisorInfo.hours[day] = hours || 'Closed';
      });
    }

    // Process reviews
    if (reviewsData.data && reviewsData.data.length > 0) {
      tripAdvisorInfo.reviews = reviewsData.data.slice(0, 5).map(review => ({
        rating: review.rating,
        title: review.title,
        text: review.text,
        date: review.published_date
      }));
    }

    //console.log(`Processed TripAdvisor info: ${JSON.stringify(tripAdvisorInfo)}`);
    return tripAdvisorInfo;
  } catch (error) {
    console.error(`Error fetching TripAdvisor details: ${error}`);
    return null;
  }
}

function testTripAdvisorApiKey() {
  const testEndpoint = `${TRIPADVISOR_API_BASE_URL}/location/search`;
  const params = {
    key: getTripadvisorApiKey(),
    searchQuery: 'Test Restaurant',
    language: 'en'
  };

  const queryString = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&');
  const fullUrl = `${testEndpoint}?${queryString}`;

  console.log(`Full request URL: ${fullUrl}`);

  const options = {
    method: 'GET',
    muteHttpExceptions: true,
    headers: {
      'Accept': 'application/json',
      'Referer': 'https://script.google.com'
    }
  };

  try {
    console.log('Sending request...');
    const response = UrlFetchApp.fetch(fullUrl, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    const responseHeaders = response.getAllHeaders();

    console.log(`Response Code: ${responseCode}`);
    console.log(`Response Headers: ${JSON.stringify(responseHeaders)}`);
    console.log(`Response Body: ${responseBody}`);

    if (responseCode === 200) {
      console.log('API Key is valid and working.');
    } else {
      console.error('API Key is not valid or there is an issue with the TripAdvisor API.');
      console.error(`Full request URL: ${fullUrl}`);
      console.error(`Response Code: ${responseCode}`);
      console.error(`Response Headers: ${JSON.stringify(responseHeaders)}`);
      console.error(`Response Body: ${responseBody}`);
    }
  } catch (error) {
    console.error(`Error testing TripAdvisor API Key: ${error}`);
    console.error(`Error stack: ${error.stack}`);
  }
}