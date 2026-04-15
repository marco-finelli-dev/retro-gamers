export async function fetchAPI(query: string, variables = {}) {
  const res = await fetch(import.meta.env.PUBLIC_WP_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const json = await res.json();

  if (json.errors) {
    console.error('GraphQL errors:', json.errors);

    throw new Error(
      json.errors[0]?.message || JSON.stringify(json.errors)
    );
  }

  return json.data;
}