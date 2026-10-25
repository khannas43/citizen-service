package org.citizen.platform.tenancy;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * Before a connection is handed out, tells PostgreSQL which state it serves (session setting
 * app.state_code). Row-level security in the database then limits every query to that state.
 * An empty value means "the default state", so code that does not know about states keeps working.
 */
public class StateAwareDataSource extends DelegatingDataSource {

    public StateAwareDataSource(DataSource target) {
        super(target);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return apply(super.getConnection());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return apply(super.getConnection(username, password));
    }

    private Connection apply(Connection connection) throws SQLException {
        String state = StateContext.get();
        try (PreparedStatement ps = connection.prepareStatement("select set_config('app.state_code', ?, false)")) {
            ps.setString(1, state == null ? "" : state);
            ps.execute();
        } catch (SQLException e) {
            connection.close();
            throw e;
        }
        return connection;
    }
}
