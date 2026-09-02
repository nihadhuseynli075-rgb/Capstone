type RegisterPageProps = {
  onBack: () => void;
};

export function RegisterPage({ onBack }: RegisterPageProps) {
  return (
    <main>
      <h1>Register</h1>

      <form>
        <label>
          Name
          <input
            type="text"
            placeholder="Enter your name"
          />
        </label>

        <br />

        <label>
          Email
          <input
            type="email"
            placeholder="Enter your email"
          />
        </label>

        <br />

        <label>
          Password
          <input
            type="password"
            placeholder="Enter your password"
          />
        </label>

        <br />
        <br />

        <button type="submit">
          Register
        </button>
      </form>

      <br />

      <button type="button" onClick={onBack}>
        Back
      </button>
    </main>
  );
}