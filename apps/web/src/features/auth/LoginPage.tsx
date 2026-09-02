type LoginPageProps = {
  onBack: () => void;
};

export function LoginPage({ onBack }: LoginPageProps) {
  return (
    <main>
      <h1>Login</h1>

      <form>
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
          Login
        </button>
      </form>

      <br />

      <button type="button" onClick={onBack}>
        Back
      </button>
    </main>
  );
}