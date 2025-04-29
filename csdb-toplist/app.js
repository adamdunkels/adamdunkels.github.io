$(document).ready(function() {
    fetchAllDemos()
        .then(data => {
            // Hide loading indicator
            $('.loading-container').addClass('hidden');

            // Initialize DataTable with the fetched data
            $('#demos-table').DataTable({
                data: data,
                columns: [
                    {
                        data: 'place',
                        width: '40px'
                    },
                    {
                        data: 'screenshot',
                        orderable: false,
                        width: '80px',
                        render: function(data, type, row) {
                            if (type === 'display' && data) {
                                return `<a href="${row.csdbUrl}" target="_blank"><img src="${data}" width="80" alt="${row.name}"></a>`;
                            }
                            return '';
                        }
                    },
                    {
                        data: 'name',
                        render: function(data, type, row) {
                            if (type === 'display') {
                                return `<a href="${row.csdbUrl}" target="_blank">${data}</a>`;
                            }
                            return data;
                        }
                    },
                    {
                        // Modified date column with proper sorting
                        data: 'releaseDate',
                        render: function(data, type, row) {
                            // For display and filter, use the formatted date
                            if (type === 'display' || type === 'filter') {
                                return data;
                            }
                            // For sorting, use the numeric timestamp
                            return row.releaseDateSortValue;
                        }
                    },
                    { data: 'event' },
                    { data: 'achievement' },
                    {
                        data: 'rating',
                        render: function(data, type, row) {
                            if (type === 'display') {
                                return `<span class="rating-cell">${data.toFixed(1)}</span>/10`;
                            }
                            return data;
                        }
                    },
                    { data: 'votes' },
                    {
                        data: 'id',
                        render: function(data) {
                            return `<a class="view-link" href="https://csdb.dk/release/?id=${data}" target="_blank">View on CSDb</a>`;
                        }
                    }
                ],
                dom: 'lrtip', // Removes pagination controls
                order: [[0, 'asc']], // Default sort by place
                lengthMenu: [[-1], ['All']], // Force "All" as the only option
                pageLength: -1,      // Show all entries
                responsive: true,
                language: {
                    search: "Search demos:"
                }
            });
        })
        .catch(error => {
            // Handle errors
            console.error('Error fetching data:', error);
            $('#loading-message').text('Error loading data from CSDB');
            $('#loading-progress').text('Please try again later');
            $('.loading-spinner').hide();
        });
});

// Function to fetch all demos across multiple pages
async function fetchAllDemos() {
    const allDemos = [];
    let page = 1;
    let hasMorePages = true;

    // Maximum number of pages to fetch to avoid infinite loops
    const MAX_PAGES = 20;

    // Continue fetching pages until there are no more or we hit our limit
    while (hasMorePages && page <= MAX_PAGES) {
        updateLoadingStatus(`Fetching page ${page}...`);

        try {
            const { entries, hasMore } = await fetchCsdbPage(page);

            if (entries.length === 0) {
                break;
            }

            // Format and add entries to our collection
            const formattedEntries = entries.map(formatDemoEntry);
            allDemos.push(...formattedEntries);

            updateLoadingStatus(`Retrieved ${allDemos.length} demos so far...`,
                                `Page ${page} complete`);

            // Check if there are more pages
            hasMorePages = hasMore;
            page++;
        } catch (error) {
            console.error(`Error fetching page ${page}:`, error);
            break;
        }
    }

    updateLoadingStatus(`Processing ${allDemos.length} demos...`,
                       `All data retrieved`);

    return allDemos;
}

// Helper function to fetch and parse a single page from CSDB
async function fetchCsdbPage(page = 1) {
    // Use a public CORS proxy to bypass CORS restrictions
    // Warning: These services may have usage limits or become unavailable
    const corsProxyUrl = 'https://corsproxy.io/?';

    // Build the CSDB URL with query parameters
    const csdbUrl = 'https://csdb.dk/webservice/?' + new URLSearchParams({
        type: 'chart',
        ctype: 'release',
        subtype: 1,
        start: (page - 1) * 25
    }).toString();

    // Make the request through the CORS proxy
    const response = await axios.get(corsProxyUrl + encodeURIComponent(csdbUrl));

    // Use the browser's built-in XML parser
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(response.data, "text/xml");

    // Check if we have any entries
    const entryElements = xmlDoc.querySelectorAll('Entry');

    if (entryElements.length === 0) {
        return { entries: [], hasMore: false };
    }

    // Convert XML elements to JavaScript objects
    const entries = [];
    entryElements.forEach(entryEl => {
        const entry = {
            Place: getElementText(entryEl, 'Place'),
            Rating: getElementText(entryEl, 'Rating'),
            Votes: getElementText(entryEl, 'Votes'),
            Release: parseReleaseElement(entryEl.querySelector('Release'))
        };
        entries.push(entry);
    });

    // If we have fewer than expected entries, assume no more pages
    const hasMore = entries.length >= 25;

    return { entries, hasMore };
}

// Parse a Release element from XML
function parseReleaseElement(releaseEl) {
    if (!releaseEl) return {};

    const release = {
        ID: getElementText(releaseEl, 'ID'),
        Name: getElementText(releaseEl, 'Name'),
        ReleaseDay: getElementText(releaseEl, 'ReleaseDay'),
        ReleaseMonth: getElementText(releaseEl, 'ReleaseMonth'),
        ReleaseYear: getElementText(releaseEl, 'ReleaseYear'),
        ScreenShot: getElementText(releaseEl, 'ScreenShot')
    };

    // Handle ReleasedBy and Group info
    const groupEl = releaseEl.querySelector('ReleasedBy Group');
    if (groupEl) {
        release.ReleasedBy = {
            Group: {
                ID: getElementText(groupEl, 'ID'),
                Name: getElementText(groupEl, 'Name')
            }
        };
    }

    // Handle ReleasedAt and Event info
    const eventEl = releaseEl.querySelector('ReleasedAt Event');
    if (eventEl) {
        release.ReleasedAt = {
            Event: {
                Name: getElementText(eventEl, 'Name')
            }
        };
    }

    // Handle Achievement info
    const achievementEl = releaseEl.querySelector('Achievement');
    if (achievementEl) {
        release.Achievement = {
            Place: getElementText(achievementEl, 'Place'),
            Compo: getElementText(achievementEl, 'Compo')
        };
    }

    return release;
}

// Helper function to get text content from an XML element
function getElementText(parentEl, tagName) {
    const el = parentEl.querySelector(tagName);
    return el ? el.textContent : '';
}

// Function to format a demo entry
function formatDemoEntry(entry) {
    const release = entry.Release;

    // Format the release date
    let releaseDate = 'Unknown';
    let releaseDateSortValue = 0; // Default sort value for unknown dates

    if (release.ReleaseDay && release.ReleaseMonth && release.ReleaseYear) {
        // Format display date as day/month/year
        releaseDate = `${release.ReleaseDay}/${release.ReleaseMonth}/${release.ReleaseYear}`;

        // Create a proper date value for sorting (year-month-day)
        // Using timestamps for reliable sorting
        releaseDateSortValue = new Date(
            parseInt(release.ReleaseYear),
            parseInt(release.ReleaseMonth) - 1, // JS months are 0-indexed
            parseInt(release.ReleaseDay)
        ).getTime();
    }

    return {
        id: release.ID,
        name: release.Name,
        place: entry.Place,
        releaseDate: releaseDate,
        releaseDateSortValue: releaseDateSortValue, // Add sortable value
        rating: parseFloat(entry.Rating) || 0,
        votes: parseInt(entry.Votes) || 0,
        csdbUrl: `https://csdb.dk/release/?id=${release.ID}`,
        screenshot: release.ScreenShot || null,
        achievement: release.Achievement ?
            `${release.Achievement.Place}. place at ${release.Achievement.Compo}` : null,
        event: release.ReleasedAt?.Event?.Name || null
    };
}

// Update the loading status display
function updateLoadingStatus(message, progress = '') {
    $('#loading-message').text(message);
    $('#loading-progress').text(progress);
    console.log(message, progress);
}